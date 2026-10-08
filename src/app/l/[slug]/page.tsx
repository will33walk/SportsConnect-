import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOrgBySlug } from '@/lib/org-data';

interface SessionRow {
  id: string;
  start_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  location_name: string | null;
}

export default async function LeagueHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const supabase = await createClient();

  // What someone opening a league page actually wants, in order: is anything
  // happening right now, and what's next. Published leagues only -- RLS keeps
  // unpublished seasons out of an anonymous read, and this page is anonymous
  // by design.
  const { data: live } = await supabase
    .from('program_sessions')
    .select('id, start_at, status, home_score, away_score, location_name')
    .eq('organization_id', org.id)
    .eq('status', 'in_progress')
    .order('start_at')
    .limit(5);

  const { data: upcoming } = await supabase
    .from('program_sessions')
    .select('id, start_at, status, home_score, away_score, location_name')
    .eq('organization_id', org.id)
    .eq('status', 'scheduled')
    .gte('start_at', new Date().toISOString())
    .order('start_at')
    .limit(8);

  const liveGames = (live ?? []) as SessionRow[];
  const nextGames = (upcoming ?? []) as SessionRow[];

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem' }}>
      {liveGames.length > 0 && (
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>
            <span className="live-dot" style={{ marginRight: '0.5rem' }} />
            Playing now
          </h2>
          <div className="ruled rule-heavy">
            {liveGames.map((g) => (
              <GameRow key={g.id} game={g} timezone={org.timezone} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 style={{ marginBottom: '1rem' }}>Coming up</h2>
        {nextGames.length === 0 ? (
          <p style={{ color: 'var(--ink-soft)' }}>
            No games on the schedule yet.
          </p>
        ) : (
          <div className="ruled rule-heavy">
            {nextGames.map((g) => (
              <GameRow key={g.id} game={g} timezone={org.timezone} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GameRow({ game, timezone }: { game: SessionRow; timezone: string }) {
  // Formatted in the LEAGUE's zone, not the reader's. A parent watching from
  // another state wants to know when the game starts at the field.
  const when = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(game.start_at));

  const scored = game.home_score !== null && game.away_score !== null;

  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span>
        {when}
        {game.location_name && (
          <>
            <br />
            <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
              {game.location_name}
            </span>
          </>
        )}
      </span>
      {scored && (
        <span style={{ fontWeight: 700, fontStretch: '125%' }}>
          {game.away_score}–{game.home_score}
        </span>
      )}
    </div>
  );
}
