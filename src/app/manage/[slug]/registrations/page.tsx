import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getOrgBySlug } from '@/lib/org-data';
import { money } from '@/lib/quote';

export const metadata: Metadata = { title: 'Registrations' };

interface LedgerRow {
  id: string;
  program_id: string;
  status: string;
  created_at: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  net_cents: number | null;
  child_number: number;
  player_name: string | null;
  tier_label: string | null;
  promo_code: string | null;
}

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { slug } = await params;
  const { season } = await searchParams;

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const supabase = await createClient();

  let query = supabase
    .from('registration_ledger')
    .select(
      'id, program_id, status, created_at, amount_due_cents, amount_paid_cents, net_cents, child_number, player_name, tier_label, promo_code',
    )
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(500);

  if (season) query = query.eq('program_id', season);

  const { data } = await query;
  const rows = (data ?? []) as LedgerRow[];

  const { data: programs } = await supabase
    .from('programs')
    .select('id, title')
    .eq('organization_id', org.id)
    .eq('kind', 'league');

  const titleOf = new Map((programs ?? []).map((p) => [p.id, p.title]));

  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const collected = confirmed.reduce((n, r) => n + r.amount_paid_cents, 0);
  const netted = confirmed.reduce((n, r) => n + (r.net_cents ?? r.amount_paid_cents), 0);
  const waitlisted = rows.filter((r) => r.status === 'waitlisted').length;

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '52rem' }}>
      <h1 style={{ fontSize: 'var(--step-3)' }}>Registrations</h1>

      {rows.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)', marginTop: '1rem' }}>
          Nobody&rsquo;s registered yet. Set prices on a season and publish it,
          and families will show up here.
        </p>
      ) : (
        <>
          {/* The three numbers a treasurer is actually looking for, stated
              plainly rather than as a row of dashboard tiles. */}
          <dl className="ruled rule-heavy" style={{ margin: '2rem 0 0' }}>
            <Figure label="Registered" value={String(confirmed.length)} />
            <Figure label="Collected" value={money(collected)} />
            <Figure
              label="In your account"
              value={money(netted)}
              note="After card processing. We take nothing."
            />
            {waitlisted > 0 && <Figure label="On the waitlist" value={String(waitlisted)} />}
          </dl>

          <div className="ruled rule-heavy" style={{ marginTop: '3rem' }}>
            {rows.map((r) => (
              <div key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  <strong>{r.player_name ?? 'Registered player'}</strong>
                  <br />
                  <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                    {titleOf.get(r.program_id) ?? 'Season'}
                    {r.tier_label && ` · ${r.tier_label}`}
                    {r.child_number > 1 && ` · family discount`}
                    {r.promo_code && ` · ${r.promo_code}`}
                  </span>
                </span>
                <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <strong>
                    {money(r.status === 'confirmed' ? r.amount_paid_cents : r.amount_due_cents)}
                  </strong>
                  <br />
                  <span
                    style={{
                      fontSize: 'var(--step--1)',
                      color:
                        r.status === 'confirmed'
                          ? 'var(--win)'
                          : r.status === 'refunded' || r.status === 'cancelled'
                            ? 'var(--loss)'
                            : 'var(--ink-faint)',
                    }}
                  >
                    {statusLabel(r.status)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <dt>
        {label}
        {note && (
          <>
            <br />
            <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>{note}</span>
          </>
        )}
      </dt>
      <dd style={{ margin: 0, fontWeight: 700, fontStretch: '125%', fontSize: 'var(--step-1)' }}>
        {value}
      </dd>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'confirmed':
      return 'Paid';
    case 'pending':
      return 'Checking out';
    case 'waitlisted':
      return 'Waitlist';
    case 'refunded':
      return 'Refunded';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}
