'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeAction } from '@/lib/safe-action';
import { assertOrgRole } from '@/lib/auth';
import { getOrgBySlug } from '@/lib/org-data';

/** Add a price option to a season. */
async function _addTier(
  orgSlug: string,
  programId: string,
  formData: FormData,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const label = String(formData.get('label') ?? '').trim();
  const dollars = String(formData.get('amount') ?? '').trim();

  if (!label) throw new Error('Give the option a name.');
  if (!/^\d+(\.\d{1,2})?$/.test(dollars)) throw new Error('Enter a price like 90 or 90.00.');

  // Cents, via a rounded multiply rather than parseFloat arithmetic, which
  // turns 90.10 into 9009.999999999998.
  const amountCents = Math.round(Number(dollars) * 100);
  if (amountCents > 100_000_00) throw new Error('That price looks wrong — check it.');

  const availableUntil = String(formData.get('available_until') ?? '').trim();

  const supabase = await createClient();
  const { error } = await supabase.from('pricing_tiers').insert({
    program_id: programId,
    organization_id: org.id,
    label,
    tier_type: 'full_season',
    amount_cents: amountCents,
    available_until: availableUntil ? new Date(`${availableUntil}T23:59:59`).toISOString() : null,
  });

  if (error) throw new Error('Couldn’t add that option.');

  revalidatePath(`/manage/${orgSlug}/seasons/${programId}/registration`);
  return { ok: true };
}

async function _removeTier(
  orgSlug: string,
  programId: string,
  tierId: string,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const supabase = await createClient();

  // Deactivate rather than delete: a registration points at its tier, and
  // deleting it would orphan a receipt. An inactive tier stops being offered
  // and keeps explaining what a past family paid.
  const { error } = await supabase
    .from('pricing_tiers')
    .update({ is_active: false })
    .eq('id', tierId);

  if (error) throw new Error('Couldn’t remove that option.');

  revalidatePath(`/manage/${orgSlug}/seasons/${programId}/registration`);
  return { ok: true };
}

/** Registration window, capacity, who pays the card fee, sibling discount. */
async function _updateRegistrationSettings(
  orgSlug: string,
  programId: string,
  formData: FormData,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const capacityRaw = String(formData.get('capacity') ?? '').trim();
  const capacity = capacityRaw ? Number(capacityRaw) : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
    throw new Error('Capacity has to be a whole number, or blank for no limit.');
  }

  const feePolicy = String(formData.get('fee_policy') ?? 'league_absorbs');
  if (!['league_absorbs', 'family_pays'].includes(feePolicy)) {
    throw new Error('Pick who covers card processing.');
  }

  const siblingEnabled = formData.get('sibling_enabled') === 'on';
  const siblingType = String(formData.get('sibling_type') ?? 'percent');
  const siblingRateRaw = String(formData.get('sibling_rate') ?? '').trim();

  let siblingRate: number | null = null;
  if (siblingEnabled) {
    if (!/^\d+(\.\d{1,2})?$/.test(siblingRateRaw)) {
      throw new Error('Enter the family discount as a number.');
    }
    siblingRate = Number(siblingRateRaw);
    if (siblingType === 'percent' && (siblingRate <= 0 || siblingRate > 100)) {
      throw new Error('A percentage discount has to be between 1 and 100.');
    }
    // Flat discounts are stored in cents, matching pricing_tiers.
    if (siblingType === 'flat') siblingRate = Math.round(siblingRate * 100);
  }

  const opens = String(formData.get('registration_opens_at') ?? '').trim();
  const closes = String(formData.get('registration_closes_at') ?? '').trim();
  if (opens && closes && closes < opens) {
    throw new Error('Registration closes before it opens.');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('programs')
    .update({
      capacity,
      fee_policy: feePolicy,
      sibling_discount_enabled: siblingEnabled,
      sibling_discount_type: siblingEnabled ? siblingType : null,
      sibling_discount_rate: siblingRate,
      registration_opens_at: opens ? new Date(`${opens}T00:00:00`).toISOString() : null,
      registration_closes_at: closes ? new Date(`${closes}T23:59:59`).toISOString() : null,
    })
    .eq('id', programId);

  if (error) throw new Error('Couldn’t save those settings.');

  revalidatePath(`/manage/${orgSlug}/seasons/${programId}/registration`);
  return { ok: true };
}

async function _addPromoCode(
  orgSlug: string,
  programId: string,
  formData: FormData,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const code = String(formData.get('code') ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,30}$/.test(code)) {
    throw new Error('Codes use letters, numbers and hyphens.');
  }

  const discountType = String(formData.get('discount_type') ?? 'percent');
  if (!['percent', 'flat'].includes(discountType)) throw new Error('Pick a discount type.');

  const valueRaw = String(formData.get('discount_value') ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(valueRaw)) throw new Error('Enter a discount amount.');

  let discountValue = Number(valueRaw);
  if (discountType === 'percent' && (discountValue <= 0 || discountValue > 100)) {
    throw new Error('A percentage has to be between 1 and 100.');
  }
  if (discountType === 'flat') discountValue = Math.round(discountValue * 100);

  const maxRaw = String(formData.get('max_redemptions') ?? '').trim();
  const maxRedemptions = maxRaw ? Number(maxRaw) : null;
  if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) {
    throw new Error('A usage limit has to be a whole number.');
  }

  const expires = String(formData.get('expires_at') ?? '').trim();
  const scoped = formData.get('this_season_only') === 'on';

  const supabase = await createClient();
  const { error } = await supabase.from('promo_codes').insert({
    organization_id: org.id,
    code,
    program_id: scoped ? programId : null,
    discount_type: discountType,
    discount_value: discountValue,
    max_redemptions: maxRedemptions,
    expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
  });

  if (error) {
    if (error.code === '23505') throw new Error('You already have a code with that name.');
    throw new Error('Couldn’t create that code.');
  }

  revalidatePath(`/manage/${orgSlug}/seasons/${programId}/registration`);
  return { ok: true };
}

async function _deactivatePromoCode(
  orgSlug: string,
  programId: string,
  promoId: string,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const supabase = await createClient();
  const { error } = await supabase
    .from('promo_codes')
    .update({ is_active: false })
    .eq('id', promoId);

  if (error) throw new Error('Couldn’t turn that code off.');

  revalidatePath(`/manage/${orgSlug}/seasons/${programId}/registration`);
  return { ok: true };
}

export const addTier = safeAction(_addTier);
export const removeTier = safeAction(_removeTier);
export const updateRegistrationSettings = safeAction(_updateRegistrationSettings);
export const addPromoCode = safeAction(_addPromoCode);
export const deactivatePromoCode = safeAction(_deactivatePromoCode);
