import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrgBySlug } from '@/lib/org-data';

// The first screen after creating a league is the one place a to-do list is
// honestly a to-do list, so it is numbered: these steps are a sequence, and
// nothing below step one can be done before it.
const STEPS: {
  title: string;
  body: string;
  href?: string;
  cta?: string;
}[] = [
  {
    title: 'Connect payments',
    body: 'Registration fees go to your own Stripe account, on your payout schedule. We never hold your money.',
    href: 'payments',
    cta: 'Connect Stripe',
  },
  {
    title: 'Create a season',
    body: 'A season holds your divisions, teams and schedule. Most leagues run one per sport per year.',
  },
  {
    title: 'Invite your board and coaches',
    body: 'People sign in with their own email, and you choose what each of them can do.',
  },
];

export default async function ManageHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '48rem' }}>
      <h1 style={{ fontSize: 'var(--step-3)' }}>Get {org.name} running</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: '0.75rem' }}>
        Three things, in order. You can leave and come back — nothing here
        expires.
      </p>

      <ol
        className="ruled rule-heavy"
        style={{ listStyle: 'none', padding: 0, margin: '2rem 0 0' }}
      >
        {STEPS.map((step, i) => (
          <li key={step.href} className="row" style={{ alignItems: 'flex-start' }}>
            <span
              aria-hidden
              style={{
                fontStretch: '125%',
                fontWeight: 700,
                fontSize: 'var(--step-2)',
                color: 'var(--ink-faint)',
                minWidth: '1.5rem',
              }}
            >
              {i + 1}
            </span>
            <span style={{ flex: 1 }}>
              <strong style={{ fontSize: 'var(--step-1)' }}>{step.title}</strong>
              <p style={{ color: 'var(--ink-soft)', margin: '0.25rem 0 0.75rem' }}>{step.body}</p>
              {step.href && step.cta ? (
                <Link href={`/manage/${slug}/${step.href}`}>{step.cta}</Link>
              ) : (
                <span style={{ color: 'var(--ink-faint)' }}>Not ready yet</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
