import { Scoreboard } from '@/components/Scoreboard';
import type { ScoreboardState } from '@/lib/sports/types';

// A real game state, not a mock image: this is the same shape the baseball
// engine emits from a live log, so the landing page shows the actual product
// rather than a picture of it.
const DEMO: ScoreboardState = {
  status: 'live',
  score: { home: 4, away: 6 },
  period: 5,
  periodLabel: 'Bot 5th',
  periodScores: { home: [0, 2, 0, 1, 1], away: [3, 0, 1, 2, 0] },
  detail: { outs: 1, balls: 3, strikes: 2, bases: ['r1', null, 'r3'] },
};

const PRICE_ROWS = [
  { name: 'SportsEngine', sub: '$79–$219 / month', fee: 'plus 3.5% + $1 per payment' },
  { name: 'LeagueApps', sub: 'from ~$400 / month', fee: 'plus 4–5.5% per payment' },
  { name: 'Jersey Watch', sub: '$29 / month', fee: 'plus 3.5% + $1 per payment' },
];

export default function Home() {
  return (
    <main>
      <section className="shell" style={{ paddingBlock: 'clamp(3rem, 10vh, 6rem)' }}>
        <div
          style={{
            display: 'grid',
            gap: '3rem',
            gridTemplateColumns: 'minmax(0, 1fr)',
          }}
        >
          <div>
            <h1 style={{ maxWidth: '14ch' }}>Run the season, not the software.</h1>
            <p
              style={{
                fontSize: 'var(--step-1)',
                color: 'var(--ink-soft)',
                marginTop: '1.25rem',
                maxWidth: '46ch',
              }}
            >
              Rosters, schedules, registration, live scores and season stats — all of
              it, for every league you run. One flat price, and we don&rsquo;t take a
              cut of your registration money.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem', flexWrap: 'wrap' }}>
              <a className="btn" href="/signup">
                Start a league
              </a>
              <a className="btn btn-quiet" href="/demo">
                See a live game
              </a>
            </div>
          </div>

          {/* The hero is the scoreboard. It is the screen a parent who couldn't
              get off work actually opens, so it is what the page opens with --
              working, not illustrated. */}
          <div style={{ maxWidth: '26rem' }}>
            <Scoreboard state={DEMO} homeName="Rivercats" awayName="Thunder" />
            <p
              style={{
                fontSize: 'var(--step--1)',
                color: 'var(--ink-faint)',
                marginTop: '0.75rem',
              }}
            >
              Every pitch a scorekeeper taps lands here, on every phone following
              the game.
            </p>
          </div>
        </div>
      </section>

      <section className="shell" style={{ paddingBlock: '3rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>What everyone else charges</h2>
        <p style={{ color: 'var(--ink-soft)' }}>
          Small leagues are paying enterprise prices for software built for state
          associations — and then paying again on every registration that comes
          through the door.
        </p>

        <div className="ruled rule-heavy" style={{ marginTop: '1.5rem' }}>
          {PRICE_ROWS.map((row) => (
            <div key={row.name} className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>{row.name}</span>
              <span style={{ color: 'var(--ink-soft)', textAlign: 'right' }}>
                {row.sub}
                <br />
                <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                  {row.fee}
                </span>
              </span>
            </div>
          ))}
          <div
            className="row"
            style={{ justifyContent: 'space-between', borderTopColor: 'var(--ink)' }}
          >
            <span style={{ fontWeight: 700, fontStretch: '125%' }}>SportsConnect</span>
            <span style={{ textAlign: 'right', fontWeight: 600 }}>
              $20 / month
              <br />
              <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-soft)' }}>
                no per-payment cut
              </span>
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
