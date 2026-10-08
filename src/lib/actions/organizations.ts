'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeAction } from '@/lib/safe-action';
import { assertOrgRole } from '@/lib/auth';
import { slugify, validateSlug } from '@/lib/slug';

async function _createOrganization(formData: FormData): Promise<never> {
  const name = String(formData.get('name') ?? '').trim();
  const rawSlug = String(formData.get('slug') ?? '').trim();
  const timezone = String(formData.get('timezone') ?? '').trim() || 'America/New_York';

  if (!name) throw new Error('Give your league a name.');

  // An empty slug field means "derive it from the name" -- most people will
  // never touch it.
  const slug = slugify(rawSlug || name);
  const slugError = validateSlug(slug);
  if (slugError) throw new Error(slugError);

  const supabase = await createClient();

  // One transaction in Postgres: the org is created and the caller becomes
  // its owner together. An organization with no owner would be unreachable,
  // so those two writes must not be separable.
  const { data: orgId, error } = await supabase.rpc('create_organization', {
    org_name: name,
    org_slug: slug,
    org_timezone: timezone,
  });

  if (error) {
    // 23505 is a unique violation, which here means the address is taken.
    // Any other failure is ours, not theirs -- don't blame their input.
    if (error.code === '23505') throw new Error('That address is already taken. Try another.');
    throw new Error('Couldn’t create the league. Try again.');
  }
  if (!orgId) throw new Error('Couldn’t create the league. Try again.');

  redirect(`/manage/${slug}`);
}

async function _updateBranding(orgSlug: string, formData: FormData): Promise<{ saved: true }> {
  await assertOrgRole(orgSlug, 'admin');

  const hex = (v: FormDataEntryValue | null): string | null => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    if (!/^#[0-9a-f]{6}$/i.test(s)) throw new Error('Colours need to look like #1A2B3C.');
    return s.toLowerCase();
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from('organizations')
    .update({
      brand_primary: hex(formData.get('brand_primary')),
      brand_accent: hex(formData.get('brand_accent')),
    })
    .eq('slug', orgSlug);

  // RLS is what actually enforces this -- assertOrgRole above only fails
  // faster, and with a message worth reading.
  if (error) throw new Error('Couldn’t save those colours.');

  revalidatePath(`/manage/${orgSlug}`);
  revalidatePath(`/l/${orgSlug}`);
  return { saved: true };
}

export const createOrganization = safeAction(_createOrganization);
export const updateBranding = safeAction(_updateBranding);
