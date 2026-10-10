import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getActiveSeasonCount, getOrgBySlug, getOrgPlan } from '@/lib/org-data';
import { listSeasons, type RosterModel, type SeasonSummary } from '@/lib/season-data';
import { PLANS, planPrice } from '@/lib/plans';

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
  const plan = await getOrgPlan(org.id);
  const activeCount = await getActiveSeasonCount(org.id);

  // On League the limit is one at a time, so the button is only live when
  // nothing is running. Letting them click into a form that the database will
  // refuse is worse than saying why up front.
  const atLimit = plan === 'league' && activeCount >= 1;

  const parents = seasons.filter((s) => !s.parentId);
  const divisionsOf = (id: string) => seasons.filter((s) => s.parentId === id);
  const orphanDivisions = seasons.filter(
    (s) => s.parentId && !parents.some((p) => p.id === s.parentId),
  );

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
        {!atLimit && (
          <Link className="btn" href={`/manage/${slug}/seasons/new`}>
            New season
          </Link>
        )}
      </div>

      {atLimit && <AtLimit slug={slug} />}

      {seasons.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)', marginTop: '2rem' }}>
          A season holds one division for one stretch of the year — teams,
          schedule, registrations.
        </p>
      ) : (
        <div style={{ marginTop: '2rem' }}>
          {parents.map((p) => (
            <SeasonGroup
              key={p.id}
              slug={slug}
              season={p}
              divisions={divisionsOf(p.id)}
              canAddDivision={plan === 'unlimited'}
            />
          ))}

          {/* A division whose parent is archived. Shown rather than dropped so
              nothing silently disappears from this list. */}
          {orphanDivisions.map((d) => (
            <SeasonGroup key={d.id} slug={slug} season={d} divisions={[]} canAddDivision={false} />
          ))}
        </div>
      )}
    </div>
  );
}

function SeasonGroup({
  slug,
  season,
  divisions,
  canAddDivision,
}: {
  slug: string;
  season: SeasonSummary;
  divisions: SeasonSummary[];
  canAddDivision: boolean;
}) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <div className="rule-heavy" style={{ paddingTop: '0.75rem' }}>
        <Link
          href={`/manage/${slug}/seasons/${season.id}`}
          className="row"
          style={{ justifyContent: 'space-between', textDecoration: 'none', paddingTop: 0 }}
        >
          <span>
            <strong style={{ fontSize: 'var(--step-1)' }}>{season.title}</strong>
            <br />
            <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
              {season.hasDivisions
                ? `${divisions.length} division${divisions.length === 1 ? '' : 's'}`
                : MODEL_LABEL[season.rosterModel]}
              {!season.hasDivisions &&
                ` · ${
                  season.teamCount === 0
                    ? 'no teams yet'
                    : `${season.teamCount} team${season.teamCount === 1 ? '' : 's'}`
                }`}
              {!season.hasDivisions && season.gameCount > 0 && ` · ${season.gameCount} games`}
            </span>
          </span>
          <span style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
            {season.status === 'published' ? 'Live' : 'Draft'}
          </span>
        </Link>
      </div>

      {divisions.length > 0 && (
        <div
          className="ruled"
          style={{ marginLeft: '1.25rem', borderTop: '1px solid var(--rule)' }}
        >
          {divisions.map((d) => (
            <Link
              key={d.id}
              href={`/manage/${slug}/seasons/${d.id}`}
              className="row"
              style={{ justifyContent: 'space-between', textDecoration: 'none' }}
            >
              <span>
                {d.title}
                <br />
                <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                  {MODEL_LABEL[d.rosterModel]} ·{' '}
                  {d.teamCount === 0 ? 'no teams yet' : `${d.teamCount} teams`}
                  {d.gameCount > 0 && ` · ${d.gameCount} games`}
                </span>
              </span>
              <span style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                {d.status === 'published' ? 'Live' : 'Draft'}
              </span>
            </Link>
          ))}
        </div>
      )}

      {canAddDivision && (
        <p style={{ marginLeft: '1.25rem', marginTop: '0.75rem', fontSize: 'var(--step--1)' }}>
          <Link href={`/manage/${slug}/seasons/new?parent=${season.id}`}>
            Add a division under {season.title}
          </Link>
        </p>
      )}
    </section>
  );
}

/**
 * The ceiling, explained.
 *
 * A hard block, as asked for — but it names both ways out: archive and keep
 * going on this plan, or upgrade for the thing the plan can't do. Refusing
 * without saying what Unlimited actually buys tells a volunteer board nothing
 * about whether $40 more is worth it.
 */
function AtLimit({ slug }: { slug: string }) {
  return (
    <div
      style={{
        marginTop: '1.5rem',
        borderTop: '2px solid var(--ink)',
        paddingTop: '1rem',
      }}
    >
      <p style={{ margin: 0 }}>
        <strong>You have a season running.</strong> The {PLANS.league.name} plan
        covers one at a time.
      </p>
      <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
        Archive the one below when it&rsquo;s over and start the next at no
        extra cost. Or move to {PLANS.unlimited.name} (
        {planPrice(PLANS.unlimited.monthlyCents)}/month) to run seasons side by
        side and group divisions under a parent league — T-ball, 8u, 11u and
        14u under one name, each with its own teams, schedule and registration,
        and one message that reaches the whole league.
      </p>
      <p style={{ marginTop: '0.75rem' }}>
        <Link className="btn" href={`/manage/${slug}/plan`} style={{ display: 'inline-block' }}>
          See Unlimited
        </Link>
      </p>
    </div>
  );
}
