import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getActiveSeasonCount, getOrgBilling, getOrgBySlug } from '@/lib/org-data';
import { hasOrgRole } from '@/lib/auth';
import { PLANS, planPrice, type Plan } from '@/lib/plans';

export const metadata: Metadata = { title: 'Plan' };

export default async function PlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const canSeeBilling = await hasOrgRole(slug, 'admin');
  const billing = canSeeBilling ? await getOrgBilling(org.id) : null;
  const current: Plan = billing?.plan ?? 'league';
  const activeSeasons = await getActiveSeasonCount(org.id);

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '46rem' }}>
      <h1 style={{ fontSize: 'var(--step-3)' }}>Plan</h1>

      <p style={{ color: 'var(--ink-soft)', marginTop: '0.75rem' }}>
        You&rsquo;re on <strong>{PLANS[current].name}</strong>.
        {current === 'league' && activeSeasons > 0 && (
          <>
            {' '}
            One season at a time, and you have {activeSeasons} running.
          </>
        )}
      </p>

      <div style={{ marginTop: '2.5rem', display: 'grid', gap: '2.5rem' }}>
        <PlanBlock plan="league" current={current} />
        <PlanBlock plan="unlimited" current={current} />
      </div>

      {/* Stated here because it's the whole reason to pick this over the
          alternatives, and the plan page is where someone is comparing. */}
      <div style={{ marginTop: '3rem', borderTop: '1px solid var(--rule)', paddingTop: '1.5rem' }}>
        <h2 style={{ fontSize: 'var(--step-0)' }}>What neither plan does</h2>
        <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
          Take a percentage of your registration money. Charge families a
          booking or service fee. Hold your money or decide when you get paid.
          Registrations go to your own Stripe account on your own payout
          schedule, and the only thing you pay us is the monthly price above.
        </p>
      </div>

      <p className="field-hint" style={{ marginTop: '2rem' }}>
        {canSeeBilling
          ? 'Billing isn’t switched on yet — get in touch and we’ll move your plan over.'
          : 'An owner or admin of this league handles the plan.'}
      </p>
    </div>
  );
}

function PlanBlock({ plan, current }: { plan: Plan; current: Plan }) {
  const info = PLANS[plan];
  const isCurrent = plan === current;

  return (
    <section>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '1rem',
          borderTop: isCurrent ? '2px solid var(--ink)' : '1px solid var(--rule)',
          paddingTop: '0.75rem',
        }}
      >
        <h2 style={{ fontSize: 'var(--step-2)' }}>{info.name}</h2>
        <span style={{ whiteSpace: 'nowrap' }}>
          <strong style={{ fontSize: 'var(--step-2)', fontStretch: '125%' }}>
            {planPrice(info.monthlyCents)}
          </strong>
          <span style={{ color: 'var(--ink-faint)' }}>/month</span>
        </span>
      </div>

      <p style={{ color: 'var(--ink-soft)', marginTop: '0.25rem' }}>
        {info.tagline}
        {isCurrent && (
          <span style={{ color: 'var(--win)', fontWeight: 600 }}> · your plan</span>
        )}
      </p>

      <ul className="ruled" style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
        {info.includes.map((line) => (
          <li key={line} className="row">
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
