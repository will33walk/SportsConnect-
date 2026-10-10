import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getOrgBySlug } from '@/lib/org-data';
import { money, type QuoteLine } from '@/lib/quote';

export const metadata: Metadata = { title: 'Registration' };

export default async function DonePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; programId: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const { slug, programId } = await params;
  const { r } = await searchParams;

  const org = await getOrgBySlug(slug);
  if (!org) notFound();
  if (!r) notFound();

  const supabase = await createClient();

  // RLS limits this to the family's own registrations, so a guessed id in the
  // query string returns nothing rather than someone else's receipt.
  const { data: reg } = await supabase
    .from('registrations')
    .select('id, status, amount_due_cents, amount_paid_cents, quote_lines, created_at, dependent_id')
    .eq('id', r)
    .maybeSingle();

  if (!reg) notFound();

  const { data: program } = await supabase
    .from('programs')
    .select('title')
    .eq('id', programId)
    .maybeSingle();

  const lines = (Array.isArray(reg.quote_lines) ? reg.quote_lines : []) as QuoteLine[];

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '34rem' }}>
      <h1 style={{ fontSize: 'var(--step-3)' }}>{headline(reg.status)}</h1>

      <p style={{ color: 'var(--ink-soft)', marginTop: '0.75rem' }}>
        {body(reg.status, program?.title ?? 'this season', org.name)}
      </p>

      {lines.length > 0 && reg.status !== 'waitlisted' && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: 'var(--step-0)' }}>What you paid</h2>
          <dl className="ruled rule-heavy" style={{ margin: '0.75rem 0 0' }}>
            {lines.map((l, i) => (
              <div key={i} className="row" style={{ justifyContent: 'space-between' }}>
                <dt style={{ color: l.amountCents < 0 ? 'var(--win)' : 'var(--ink)' }}>{l.label}</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>{money(l.amountCents)}</dd>
              </div>
            ))}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <dt style={{ fontWeight: 700 }}>Total</dt>
              <dd style={{ margin: 0, fontWeight: 700 }}>
                {money(reg.status === 'confirmed' ? reg.amount_paid_cents : reg.amount_due_cents)}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <p style={{ marginTop: '2.5rem' }}>
        <Link href={`/l/${slug}`}>Back to {org.name}</Link>
      </p>
    </div>
  );
}

function headline(status: string): string {
  switch (status) {
    case 'confirmed':
      return 'You’re registered';
    case 'waitlisted':
      return 'You’re on the waitlist';
    case 'pending':
      return 'Almost there';
    case 'refunded':
      return 'This registration was refunded';
    case 'cancelled':
      return 'This registration was cancelled';
    default:
      return 'Registration';
  }
}

function body(status: string, programTitle: string, orgName: string): string {
  switch (status) {
    case 'confirmed':
      return `You’re all set for ${programTitle}. ${orgName} will be in touch about teams and the schedule — and you’ll see both here as soon as they’re posted.`;
    case 'waitlisted':
      return `${programTitle} is full. You haven’t been charged. ${orgName} will contact you if a spot opens up.`;
    case 'pending':
      // Reachable if Stripe's webhook hasn't landed yet, which is usually a
      // second or two. Say so honestly instead of claiming success.
      return 'Your payment is still going through. This page will show your spot as confirmed once it lands — give it a moment and refresh.';
    case 'refunded':
      return `Your payment for ${programTitle} was refunded. Get in touch with ${orgName} if that wasn’t expected.`;
    default:
      return `Get in touch with ${orgName} if you think this is wrong.`;
  }
}
