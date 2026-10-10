import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getOrgBySlug } from '@/lib/org-data';

export const metadata: Metadata = { title: 'Register' };

export default async function ProgramsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const supabase = await createClient();

  // Published only — RLS enforces that for anonymous visitors anyway, and
  // this page is meant to be opened from a flyer by someone with no account.
  const { data: programs } = await supabase
    .from('programs')
    .select('id, title, short_description, starts_on, ends_on, age_min, age_max, parent_program_id, registration_closes_at')
    .eq('organization_id', org.id)
    .eq('status', 'published')
    .order('starts_on', { nullsFirst: false });

  // Cheapest live price per program, so a family can see what things cost
  // without opening four pages.
  const ids = (programs ?? []).map((p) => p.id);
  const { data: tiers } = ids.length
    ? await supabase
        .from('pricing_tiers')
        .select('program_id, amount_cents')
        .in('program_id', ids)
        .eq('is_active', true)
    : { data: [] };

  const fromPrice = new Map<string, number>();
  for (const t of tiers ?? []) {
    const held = fromPrice.get(t.program_id);
    if (held === undefined || t.amount_cents < held) fromPrice.set(t.program_id, t.amount_cents);
  }

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '44rem' }}>
      <h1 style={{ fontSize: 'var(--step-3)' }}>Register</h1>

      {(programs ?? []).length === 0 ? (
        <p style={{ color: 'var(--ink-soft)', marginTop: '1rem' }}>
          Nothing open right now. {org.name} will post new seasons here.
        </p>
      ) : (
        <div className="ruled rule-heavy" style={{ marginTop: '2rem' }}>
          {programs!.map((p) => {
            const price = fromPrice.get(p.id);
            // A division shows its parent's name above it, so a family
            // scanning "MCYBL — 8u" knows which league they're signing up to.
            const parentTitle = p.parent_program_id
              ? (programs!.find((x) => x.id === p.parent_program_id)?.title ?? null)
              : null;
            return (
              <Link
                key={p.id}
                href={`/l/${slug}/register/${p.id}`}
                className="row"
                style={{ justifyContent: 'space-between', textDecoration: 'none' }}
              >
                <span>
                  {parentTitle && (
                    <>
                      <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                        {parentTitle}
                      </span>
                      <br />
                    </>
                  )}
                  <strong style={{ fontSize: 'var(--step-1)' }}>{p.title}</strong>
                  {(p.age_min !== null || p.age_max !== null) && (
                    <>
                      <br />
                      <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                        {ageRange(p.age_min, p.age_max)}
                      </span>
                    </>
                  )}
                  {p.short_description && (
                    <>
                      <br />
                      <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-soft)' }}>
                        {p.short_description}
                      </span>
                    </>
                  )}
                </span>
                <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                  {price === undefined ? '' : price === 0 ? 'Free' : `$${(price / 100).toFixed(0)}`}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ageRange(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `Ages ${min}–${max}`;
  if (min !== null) return `Ages ${min} and up`;
  if (max !== null) return `Up to age ${max}`;
  return '';
}
