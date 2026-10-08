import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getOrgBySlug } from '@/lib/org-data';
import { listCoaches } from '@/lib/people-data';
import { decideApplication } from '@/lib/actions/coaches';

export const metadata: Metadata = { title: 'Coaches' };

export default async function CoachesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const coaches = await listCoaches(org.id);
  const pending = coaches.filter((c) => c.status === 'applied');
  const approved = coaches.filter((c) => c.status === 'approved');
  const closed = coaches.filter((c) => c.status === 'declined' || c.status === 'withdrawn');

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '48rem' }}>
      <h1 style={{ fontSize: 'var(--step-3)' }}>Coaches</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: '0.75rem' }}>
        Share <code>/l/{slug}/coach</code> with anyone who wants to volunteer.
      </p>

      {pending.length > 0 && (
        <section style={{ marginTop: '2.5rem' }}>
          <h2>Waiting on you</h2>
          <div className="ruled rule-heavy" style={{ marginTop: '1rem' }}>
            {pending.map((c) => {
              async function approve() {
                'use server';
                await decideApplication(slug, c.userId, 'approved');
              }
              async function decline() {
                'use server';
                await decideApplication(slug, c.userId, 'declined');
              }
              return (
                <div key={c.userId} className="row" style={{ alignItems: 'flex-start' }}>
                  <span style={{ flex: 1 }}>
                    <strong>{c.name}</strong>
                    <br />
                    <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                      {[c.email, c.phone].filter(Boolean).join(' · ')}
                    </span>
                    {c.experience && (
                      <p style={{ color: 'var(--ink-soft)', margin: '0.5rem 0 0' }}>
                        {c.experience}
                      </p>
                    )}
                  </span>
                  <span style={{ display: 'flex', gap: '0.5rem' }}>
                    <form action={approve}>
                      <button
                        className="btn"
                        type="submit"
                        style={{ padding: '0.3rem 0.65rem', fontSize: 'var(--step--1)' }}
                      >
                        Approve
                      </button>
                    </form>
                    <form action={decline}>
                      <button
                        className="btn btn-quiet"
                        type="submit"
                        style={{ padding: '0.3rem 0.65rem', fontSize: 'var(--step--1)' }}
                      >
                        Decline
                      </button>
                    </form>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section style={{ marginTop: '3rem' }}>
        <h2>Approved</h2>
        {approved.length === 0 ? (
          <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
            Nobody yet.
          </p>
        ) : (
          <>
            <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
              Approving someone doesn&rsquo;t put them on a team. They need
              every requirement recorded first.
            </p>
            <div className="ruled rule-heavy" style={{ marginTop: '1rem' }}>
              {approved.map((c) => (
                <Link
                  key={c.userId}
                  href={`/manage/${slug}/coaches/${c.userId}`}
                  className="row"
                  style={{ justifyContent: 'space-between', textDecoration: 'none' }}
                >
                  <span>
                    <strong>{c.name}</strong>
                    {c.email && (
                      <>
                        <br />
                        <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                          {c.email}
                        </span>
                      </>
                    )}
                  </span>
                  <ClearanceBadge cleared={c.cleared} missing={c.missingCount} />
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {closed.length > 0 && (
        <section style={{ marginTop: '3rem' }}>
          <h2>Closed</h2>
          <div className="ruled" style={{ marginTop: '1rem', borderTop: '1px solid var(--rule)' }}>
            {closed.map((c) => (
              <div key={c.userId} className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink-soft)' }}>{c.name}</span>
                <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--step--1)' }}>
                  {c.status === 'declined' ? 'Declined' : 'Withdrew'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Clearance, stated plainly. Not amber: amber means a game is live, and
 * borrowing it here for "attention" would dilute the one thing it signals.
 */
function ClearanceBadge({ cleared, missing }: { cleared: boolean; missing: number }) {
  if (cleared) {
    return (
      <span style={{ color: 'var(--win)', fontWeight: 600, whiteSpace: 'nowrap' }}>
        Cleared
      </span>
    );
  }
  return (
    <span style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
      {missing} outstanding
    </span>
  );
}
