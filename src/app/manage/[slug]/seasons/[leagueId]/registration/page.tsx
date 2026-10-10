import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getOrgBySlug } from '@/lib/org-data';
import { money, processingFee } from '@/lib/quote';
import { SimpleForm } from '@/components/SimpleForm';
import { RegistrationSettingsForm } from '@/components/RegistrationSettingsForm';
import {
  addPromoCode,
  addTier,
  deactivatePromoCode,
  removeTier,
  updateRegistrationSettings,
} from '@/lib/actions/pricing-setup';

export const metadata: Metadata = { title: 'Registration setup' };

export default async function RegistrationSetupPage({
  params,
}: {
  params: Promise<{ slug: string; leagueId: string }>;
}) {
  const { slug, leagueId } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const supabase = await createClient();

  const { data: program } = await supabase
    .from('programs')
    .select(
      'id, title, capacity, fee_policy, sibling_discount_enabled, sibling_discount_type, sibling_discount_rate, registration_opens_at, registration_closes_at',
    )
    .eq('id', leagueId)
    .eq('organization_id', org.id)
    .maybeSingle();

  if (!program) notFound();

  const { data: tiers } = await supabase
    .from('pricing_tiers')
    .select('id, label, amount_cents, available_until')
    .eq('program_id', leagueId)
    .eq('is_active', true)
    .order('sort_order');

  const { data: codes } = await supabase
    .from('promo_codes')
    .select('id, code, discount_type, discount_value, max_redemptions, redeemed_count, expires_at, program_id')
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '44rem' }}>
      <p style={{ fontSize: 'var(--step--1)' }}>
        <Link href={`/manage/${slug}/seasons/${leagueId}`}>{program.title}</Link>
      </p>

      <h1 style={{ fontSize: 'var(--step-3)', marginTop: '1rem' }}>Registration</h1>

      {/* Prices */}
      <section style={{ marginTop: '2.5rem' }}>
        <h2>What it costs</h2>

        {(tiers ?? []).length > 0 && (
          <div className="ruled rule-heavy" style={{ marginTop: '1rem' }}>
            {tiers!.map((t) => {
              async function drop() {
                'use server';
                await removeTier(slug, leagueId, t.id);
              }
              const net = t.amount_cents - processingFee(t.amount_cents);
              return (
                <div key={t.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    {t.label}
                    <br />
                    <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                      {program.fee_policy === 'league_absorbs'
                        ? `You keep ${money(net)} after card processing`
                        : `You keep ${money(t.amount_cents)} — the family covers processing`}
                      {t.available_until && ` · until ${shortDate(t.available_until, org.timezone)}`}
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <strong>{money(t.amount_cents)}</strong>
                    <form action={drop}>
                      <button
                        type="submit"
                        className="btn btn-quiet"
                        style={{ padding: '0.25rem 0.55rem', fontSize: 'var(--step--1)' }}
                      >
                        Remove
                      </button>
                    </form>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: '1.5rem' }}>
          <SimpleForm
            action={addTier.bind(null, slug, leagueId)}
            submitLabel="Add option"
            fields={[
              { name: 'label', label: 'Name', placeholder: 'Full season', required: true },
              { name: 'amount', label: 'Price', placeholder: '90', required: true, width: '7rem' },
              { name: 'available_until', label: 'Available until', type: 'date', width: '11rem' },
            ]}
            hint="Add an early-bird price with an end date and a regular one without, and the right one shows itself at the right time."
          />
        </div>
      </section>

      {/* Settings */}
      <section style={{ marginTop: '3rem' }}>
        <h2>How registration works</h2>
        <RegistrationSettingsForm
          action={updateRegistrationSettings.bind(null, slug, leagueId)}
          capacity={program.capacity}
          feePolicy={program.fee_policy as 'league_absorbs' | 'family_pays'}
          siblingEnabled={program.sibling_discount_enabled}
          siblingType={(program.sibling_discount_type ?? 'percent') as 'percent' | 'flat'}
          siblingRate={program.sibling_discount_rate}
          opensAt={program.registration_opens_at}
          closesAt={program.registration_closes_at}
        />
      </section>

      {/* Codes */}
      <section style={{ marginTop: '3rem' }}>
        <h2>Discount codes</h2>
        <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
          Families type these at checkout. The family discount for a second
          child applies on its own — no code needed for that.
        </p>

        {(codes ?? []).length > 0 && (
          <div className="ruled rule-heavy" style={{ marginTop: '1rem' }}>
            {codes!.map((c) => {
              async function off() {
                'use server';
                await deactivatePromoCode(slug, leagueId, c.id);
              }
              return (
                <div key={c.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    <strong style={{ fontStretch: '125%' }}>{c.code}</strong>
                    <br />
                    <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                      {c.discount_type === 'percent'
                        ? `${Number(c.discount_value)}% off`
                        : `${money(Number(c.discount_value))} off`}
                      {c.program_id ? ' · this season only' : ' · any season'}
                      {c.max_redemptions !== null &&
                        ` · used ${c.redeemed_count} of ${c.max_redemptions}`}
                      {c.expires_at && ` · expires ${shortDate(c.expires_at, org.timezone)}`}
                    </span>
                  </span>
                  <form action={off}>
                    <button
                      type="submit"
                      className="btn btn-quiet"
                      style={{ padding: '0.25rem 0.55rem', fontSize: 'var(--step--1)' }}
                    >
                      Turn off
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: '1.5rem' }}>
          <SimpleForm
            action={addPromoCode.bind(null, slug, leagueId)}
            submitLabel="Create code"
            fields={[
              { name: 'code', label: 'Code', placeholder: 'SPRING27', required: true, width: '10rem' },
              {
                name: 'discount_type',
                label: 'Type',
                type: 'select',
                options: [
                  { value: 'percent', label: '% off' },
                  { value: 'flat', label: '$ off' },
                ],
                width: '8rem',
              },
              { name: 'discount_value', label: 'Amount', placeholder: '10', required: true, width: '7rem' },
              { name: 'max_redemptions', label: 'Usage limit', placeholder: 'No limit', width: '9rem' },
              { name: 'expires_at', label: 'Expires', type: 'date', width: '11rem' },
              { name: 'this_season_only', label: 'This season only', type: 'checkbox' },
            ]}
          />
        </div>
      </section>
    </div>
  );
}

function shortDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: tz,
  }).format(new Date(iso));
}
