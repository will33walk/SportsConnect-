import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getOrgBySlug } from '@/lib/org-data';
import { listSeasons, type RosterModel } from '@/lib/season-data';

export const metadata: Metadata = { title: 'Seasons' };

const MODEL_LABEL: Record<RosterModel, string> = {
  assigned: 'League assigns players',
  draft: 'Coaches draft',
  team_registration: 'Teams sign up whole',
};

export default async function SeasonsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const seasons = await listSeasons(org.id);

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '48rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ fontSize: 'var(--step-3)' }}>Seasons</h1>
        <Link className="btn" href={`/manage/${slug}/seasons/new`}>
          New season
        </Link>
      </div>

      {seasons.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)', marginTop: '2rem' }}>
          A season holds one division for one stretch of the year — teams,
          schedule, registrations. Most leagues run several at once.
        </p>
      ) : (
        <div className="ruled rule-heavy" style={{ marginTop: '2rem' }}>
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/manage/${slug}/seasons/${s.id}`}
              className="row"
              style={{ justifyContent: 'space-between', textDecoration: 'none' }}
            >
              <span>
                <strong style={{ fontSize: 'var(--step-1)' }}>{s.title}</strong>
                <br />
                <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                  {MODEL_LABEL[s.rosterModel]} ·{' '}
                  {s.teamCount === 0
                    ? 'no teams yet'
                    : `${s.teamCount} team${s.teamCount === 1 ? '' : 's'}`}
                  {s.gameCount > 0 && ` · ${s.gameCount} games`}
                </span>
              </span>
              <span style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                {s.status === 'published' ? 'Live' : 'Draft'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
