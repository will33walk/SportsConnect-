import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getOrgBySlug } from '@/lib/org-data';
import { getSeason, listSeasons, listTeams, type RosterModel } from '@/lib/season-data';
import { AddTeamForm } from '@/components/AddTeamForm';
import { ScheduleBuilder } from '@/components/ScheduleBuilder';
import { AddGameForm } from '@/components/AddGameForm';
import { addGame } from '@/lib/actions/games';
import { getOrgPlan } from '@/lib/org-data';
import {
  clearSchedule,
  createTeam,
  generateSchedule,
  setPublication,
  setSeasonStatus,
} from '@/lib/actions/seasons';

export const metadata: Metadata = { title: 'Season' };

const MODEL_NOTE: Record<RosterModel, string> = {
  assigned: 'Players register, then you place them on these teams.',
  draft: 'Players register into a pool, then coaches draft from it.',
  team_registration: 'Captains register their own teams — these appear as they sign up.',
};

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ slug: string; leagueId: string }>;
}) {
  const { slug, leagueId } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const season = await getSeason(org.id, leagueId);
  if (!season) notFound();

  const teams = await listTeams(leagueId);
  // Divisions under this season, if it's a parent. Loaded from the same
  // listSeasons() the index uses so the counts agree between the two screens.
  const divisions = (await listSeasons(org.id)).filter((s) => s.parentId === leagueId);

  const supabase = await createClient();
  const { data: games } = await supabase
    .from('program_sessions')
    .select('id, start_at, location_name, home_team_id, away_team_id, round_label')
    .eq('program_id', leagueId)
    .eq('session_type', 'game')
    .order('start_at')
    .limit(200);

  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  const addTeam = createTeam.bind(null, slug, leagueId);
  const buildSchedule = generateSchedule.bind(null, slug, leagueId);
  const addOneGame = addGame.bind(null, slug, leagueId);
  const plan = await getOrgPlan(org.id);

  async function publishSeason() {
    'use server';
    await setSeasonStatus(slug, leagueId, season!.status === 'published' ? 'draft' : 'published');
  }
  async function wipeSchedule() {
    'use server';
    await clearSchedule(slug, leagueId);
  }

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '48rem' }}>
      <p style={{ fontSize: 'var(--step--1)' }}>
        <Link href={`/manage/${slug}/seasons`}>Seasons</Link>
        {season.parentTitle && season.parentId && (
          <>
            {' / '}
            <Link href={`/manage/${slug}/seasons/${season.parentId}`}>{season.parentTitle}</Link>
          </>
        )}
      </p>

      <h1 style={{ fontSize: 'var(--step-3)', marginTop: '1rem' }}>{season.title}</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
        {MODEL_NOTE[season.rosterModel]}
        {season.involvesMinors && ' Coaches need their requirements finished before they can be assigned.'}
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
        <form action={publishSeason}>
          <button className={season.status === 'published' ? 'btn btn-quiet' : 'btn'} type="submit">
            {season.status === 'published' ? 'Unpublish season' : 'Publish season'}
          </button>
        </form>
        <Link
          className="btn btn-quiet"
          href={`/manage/${slug}/seasons/${leagueId}/registration`}
          style={{ display: 'inline-block' }}
        >
          Registration &amp; pricing
        </Link>
      </div>

      {/* Divisions. Only meaningful for a top-level season on Unlimited --
          a division can't have divisions of its own, and the League plan
          doesn't include them at all. */}
      {!season.parentId && (plan === 'unlimited' || divisions.length > 0) && (
        <section style={{ marginTop: '3rem' }}>
          <h2>Divisions</h2>

          {divisions.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
              Split this into age groups — T-ball, 8u, 11u, 14u — each with its
              own teams, schedule and registration.
            </p>
          ) : (
            <div className="ruled rule-heavy" style={{ marginTop: '1rem' }}>
              {divisions.map((d) => (
                <Link
                  key={d.id}
                  href={`/manage/${slug}/seasons/${d.id}`}
                  className="row"
                  style={{ justifyContent: 'space-between', textDecoration: 'none' }}
                >
                  <span>
                    <strong>{d.title}</strong>
                    <br />
                    <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
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

          {plan === 'unlimited' && (
            <p style={{ marginTop: '1rem' }}>
              <Link href={`/manage/${slug}/seasons/new?parent=${leagueId}`}>
                Add a division
              </Link>
            </p>
          )}
        </section>
      )}

      {/* Teams */}
      <section style={{ marginTop: '3rem' }}>
        <h2>Teams</h2>

        {season.rosterModel !== 'team_registration' && (
          <div style={{ marginTop: '1rem' }}>
            <AddTeamForm action={addTeam} />
          </div>
        )}

        {teams.length === 0 ? (
          <p style={{ color: 'var(--ink-soft)', marginTop: '1.5rem' }}>
            {season.rosterModel === 'team_registration'
              ? 'No teams have signed up yet.'
              : 'No teams yet.'}
          </p>
        ) : (
          <div className="ruled rule-heavy" style={{ marginTop: '1.5rem' }}>
            {teams.map((t) => (
              <Link
                key={t.id}
                href={`/manage/${slug}/teams/${t.id}`}
                className="row"
                style={{ justifyContent: 'space-between', textDecoration: 'none' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {t.color && (
                    <span
                      aria-hidden
                      style={{
                        width: '0.75rem',
                        height: '0.75rem',
                        background: t.color,
                        borderRadius: '2px',
                        flex: '0 0 auto',
                      }}
                    />
                  )}
                  <strong>{t.name}</strong>
                </span>
                <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                  {t.playerCount} player{t.playerCount === 1 ? '' : 's'} ·{' '}
                  {t.coachCount} coach{t.coachCount === 1 ? '' : 'es'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Schedule */}
      <section style={{ marginTop: '3rem' }}>
        <h2>Schedule</h2>

        {(games?.length ?? 0) === 0 ? (
          <div style={{ marginTop: '1rem' }}>
            <ScheduleBuilder
              action={buildSchedule}
              teamCount={teams.length}
              defaultStart={season.startsOn ?? new Date().toISOString().slice(0, 10)}
            />

            {teams.length >= 2 && (
              <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--rule)', paddingTop: '1.5rem' }}>
                <h3 style={{ fontSize: 'var(--step-0)' }}>Or add games one at a time</h3>
                <p className="field-hint" style={{ marginBottom: '0.5rem' }}>
                  Some leagues schedule by hand all season. That works fine.
                </p>
                <AddGameForm action={addOneGame} teams={teams} />
              </div>
            )}
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: '1rem',
                marginTop: '0.5rem',
              }}
            >
              <p style={{ color: 'var(--ink-soft)', margin: 0 }}>
                {games!.length} games.
              </p>
              <form action={wipeSchedule}>
                <button
                  type="submit"
                  className="btn btn-quiet"
                  style={{ padding: '0.3rem 0.65rem', fontSize: 'var(--step--1)' }}
                >
                  Clear and rebuild
                </button>
              </form>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: 'var(--step-0)' }}>Add a game by hand</h3>
              <p className="field-hint" style={{ marginBottom: '0.5rem' }}>
                A makeup, a scrimmage, a tournament game — anything the
                generator didn&rsquo;t lay out.
              </p>
              <AddGameForm action={addOneGame} teams={teams} />
            </div>

            <div className="ruled rule-heavy" style={{ marginTop: '2rem' }}>
              {games!.map((g) => (
                <div key={g.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    {teamName.get(g.away_team_id ?? '') ?? 'TBD'} at{' '}
                    {teamName.get(g.home_team_id ?? '') ?? 'TBD'}
                    <br />
                    <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                      {g.round_label}
                      {g.location_name && ` · ${g.location_name}`}
                    </span>
                  </span>
                  <span style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                    {new Intl.DateTimeFormat('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: org.timezone,
                    }).format(new Date(g.start_at))}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* What families can see */}
      <section style={{ marginTop: '3rem' }}>
        <h2>What families can see</h2>
        <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
          Each of these is separate, so you can put the schedule up while
          rosters are still moving.
        </p>

        <div className="ruled rule-heavy" style={{ marginTop: '1rem' }}>
          <PublishRow
            slug={slug}
            leagueId={leagueId}
            facet="schedule"
            label="Schedule"
            published={season.schedulePublished}
          />
          <PublishRow
            slug={slug}
            leagueId={leagueId}
            facet="rosters"
            label="Rosters"
            published={season.rostersPublished}
            note={season.involvesMinors ? 'Shown as first name and last initial.' : undefined}
          />
          <PublishRow
            slug={slug}
            leagueId={leagueId}
            facet="standings"
            label="Standings"
            published={season.standingsPublished}
          />
        </div>

        {season.status !== 'published' && (
          <p className="field-hint" style={{ marginTop: '1rem' }}>
            The season itself is still unpublished, so none of this is visible
            yet whatever these say.
          </p>
        )}
      </section>
    </div>
  );
}

function PublishRow({
  slug,
  leagueId,
  facet,
  label,
  published,
  note,
}: {
  slug: string;
  leagueId: string;
  facet: 'schedule' | 'rosters' | 'standings';
  label: string;
  published: boolean;
  note?: string;
}) {
  async function toggle() {
    'use server';
    await setPublication(slug, leagueId, facet, !published);
  }

  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span>
        {label}
        {note && (
          <>
            <br />
            <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>{note}</span>
          </>
        )}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ color: published ? 'var(--win)' : 'var(--ink-faint)' }}>
          {published ? 'Public' : 'Hidden'}
        </span>
        <form action={toggle}>
          <button
            type="submit"
            className="btn btn-quiet"
            style={{ padding: '0.3rem 0.65rem', fontSize: 'var(--step--1)' }}
          >
            {published ? 'Hide' : 'Publish'}
          </button>
        </form>
      </span>
    </div>
  );
}
