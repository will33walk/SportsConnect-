import { createClient } from '@/lib/supabase/server';
import { computeTierAvailability } from '@/lib/pricing';
import type { FeePolicy, SiblingRule, Tier } from '@/lib/quote';

export interface ProgramForRegistration {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  sportKey: string | null;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
  ageMin: number | null;
  ageMax: number | null;
  capacity: number | null;
  involvesMinors: boolean;
  feePolicy: FeePolicy;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  sibling: SiblingRule | null;
  rosterModel: 'draft' | 'assigned' | 'team_registration' | null;
}

export interface RegistrationQuestion {
  id: string;
  label: string;
  fieldType: 'short_text' | 'long_text' | 'select' | 'multi_select' | 'checkbox' | 'date';
  options: string[] | null;
  helpText: string | null;
  required: boolean;
}

export interface Dependent {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
}

/** Why registration isn't open, in words for a parent. Null when it is. */
export function registrationClosedReason(
  p: ProgramForRegistration,
  spotsLeft: number | null,
  now: Date,
): string | null {
  if (p.status !== 'published') return 'Registration isn’t open yet.';
  if (p.registrationOpensAt && new Date(p.registrationOpensAt) > now) {
    return 'Registration hasn’t opened yet.';
  }
  if (p.registrationClosesAt && new Date(p.registrationClosesAt) < now) {
    return 'Registration has closed.';
  }
  // Not a refusal: a full program still takes names for the waitlist, so the
  // caller shows the form with different wording rather than hiding it.
  if (spotsLeft !== null && spotsLeft <= 0) return null;
  return null;
}

export async function getProgramForRegistration(
  orgId: string,
  programId: string,
): Promise<ProgramForRegistration | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('programs')
    .select(
      'id, organization_id, title, description, sport_key, status, starts_on, ends_on, age_min, age_max, capacity, involves_minors, fee_policy, registration_opens_at, registration_closes_at, sibling_discount_enabled, sibling_discount_type, sibling_discount_rate',
    )
    .eq('id', programId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!data) return null;

  const { data: league } = await supabase
    .from('leagues')
    .select('roster_model')
    .eq('id', programId)
    .maybeSingle();

  return {
    id: data.id,
    organizationId: data.organization_id,
    title: data.title,
    description: data.description,
    sportKey: data.sport_key,
    status: data.status,
    startsOn: data.starts_on,
    endsOn: data.ends_on,
    ageMin: data.age_min,
    ageMax: data.age_max,
    capacity: data.capacity,
    involvesMinors: data.involves_minors,
    feePolicy: data.fee_policy as FeePolicy,
    registrationOpensAt: data.registration_opens_at,
    registrationClosesAt: data.registration_closes_at,
    sibling:
      data.sibling_discount_enabled && data.sibling_discount_rate !== null
        ? {
            enabled: true,
            type: (data.sibling_discount_type ?? 'percent') as 'percent' | 'flat',
            rate: Number(data.sibling_discount_rate),
          }
        : null,
    rosterModel: league?.roster_model ?? null,
  };
}

/**
 * The tiers a parent may actually choose right now.
 *
 * Unavailable tiers are dropped rather than greyed out -- an early-bird price
 * that closed last week is not information, it's a reminder that they missed
 * something.
 */
export async function listAvailableTiers(programId: string): Promise<Tier[]> {
  const supabase = await createClient();

  const { data: tiers } = await supabase
    .from('pricing_tiers')
    .select('id, label, amount_cents, available_from, available_until, capacity')
    .eq('program_id', programId)
    .eq('is_active', true)
    .order('sort_order');

  if (!tiers || tiers.length === 0) return [];

  // How many registrations each capped tier has used.
  const capped = tiers.filter((t) => t.capacity !== null).map((t) => t.id);
  const used = new Map<string, number>();

  if (capped.length > 0) {
    const { data: rows } = await supabase
      .from('registrations')
      .select('pricing_tier_id')
      .in('pricing_tier_id', capped)
      .in('status', ['pending', 'confirmed']);

    for (const r of rows ?? []) {
      if (r.pricing_tier_id) used.set(r.pricing_tier_id, (used.get(r.pricing_tier_id) ?? 0) + 1);
    }
  }

  const now = new Date();

  return tiers.flatMap((t): Tier[] => {
    const { available } = computeTierAvailability(
      now,
      t.available_from,
      t.available_until,
      t.capacity,
      used.get(t.id) ?? 0,
    );
    if (!available) return [];
    return [{ id: t.id, label: t.label, amountCents: t.amount_cents }];
  });
}

export async function listQuestions(programId: string): Promise<RegistrationQuestion[]> {
  const supabase = await createClient();

  const { data: links } = await supabase
    .from('program_questions')
    .select('question_id, is_required, sort_order')
    .eq('program_id', programId)
    .order('sort_order');

  if (!links || links.length === 0) return [];

  const { data: questions } = await supabase
    .from('question_bank')
    .select('id, label, field_type, options, help_text')
    .in('id', links.map((l) => l.question_id));

  const byId = new Map((questions ?? []).map((q) => [q.id, q]));

  return links.flatMap((l): RegistrationQuestion[] => {
    const q = byId.get(l.question_id);
    if (!q) return [];
    return [{
      id: q.id,
      label: q.label,
      fieldType: q.field_type,
      options: Array.isArray(q.options) ? (q.options as string[]) : null,
      helpText: q.help_text,
      required: l.is_required,
    }];
  });
}

/** Spots left, or null when the program is uncapped. */
export async function spotsRemaining(
  programId: string,
  capacity: number | null,
): Promise<number | null> {
  if (capacity === null) return null;

  const supabase = await createClient();
  const { count } = await supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId)
    .in('status', ['pending', 'confirmed']);

  return Math.max(0, capacity - (count ?? 0));
}

/** The caller's children in this league, for the registration picker. */
export async function myDependents(orgId: string, userId: string): Promise<Dependent[]> {
  const supabase = await createClient();

  const { data: household } = await supabase
    .from('households')
    .select('id')
    .eq('organization_id', orgId)
    .eq('primary_contact_id', userId)
    .maybeSingle();

  if (!household) return [];

  // Scoped to this household by id rather than relying on RLS: a league
  // manager can read every dependent in their org, and the registration
  // picker must only ever offer their own children.
  const { data } = await supabase
    .from('dependents')
    .select('id, first_name, last_name, date_of_birth')
    .eq('household_id', household.id)
    .order('first_name');

  return (data ?? []).map((d) => ({
    id: d.id,
    firstName: d.first_name,
    lastName: d.last_name,
    dateOfBirth: d.date_of_birth,
  }));
}

/**
 * How many of this household's children are already in this program.
 *
 * Drives the sibling discount: the next registration is child N+1, so the
 * discount applies from the second one on, across separate sittings. A parent
 * who registers one child in March and another in April still gets it.
 */
export async function siblingsAlreadyIn(
  programId: string,
  orgId: string,
  userId: string,
): Promise<number> {
  const supabase = await createClient();

  // Filtered on the caller explicitly, not left to RLS. An org admin can read
  // every household in their league, so an unfiltered maybeSingle() would
  // error for exactly the people most likely to be registering their own kids.
  const { data: household } = await supabase
    .from('households')
    .select('id')
    .eq('organization_id', orgId)
    .eq('primary_contact_id', userId)
    .maybeSingle();

  if (!household) return 0;

  const { data: kids } = await supabase
    .from('dependents')
    .select('id')
    .eq('household_id', household.id);

  if (!kids || kids.length === 0) return 0;

  const { count } = await supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId)
    .in('dependent_id', kids.map((k) => k.id))
    .in('status', ['pending', 'confirmed', 'waitlisted']);

  return count ?? 0;
}
