import type { ScoreboardState } from '@/lib/sports/types';

interface Props {
  state: ScoreboardState;
  homeName: string;
  awayName: string;
}

/**
 * The thing a grandparent in Florida opens on their phone.
 *
 * Sport-agnostic by construction: it reads a ScoreboardState, which every
 * engine produces, and prints `periodLabel` rather than deciding for itself
 * whether to say "Top 3rd" or "Q2". Baseball's count and baserunners arrive
 * in `detail` and are shown when present -- a basketball game simply has none
 * and the strip disappears, with nothing here needing to know why.
 */
export function Scoreboard({ state, homeName, awayName }: Props) {
  const live = state.status === 'live';
  const detail = state.detail as
    | { outs?: number; balls?: number; strikes?: number; bases?: (string | null)[] }
    | undefined;

  return (
    <div className="board">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <span className="board-team">
          {live && <span className="live-dot" style={{ marginRight: '0.5rem' }} />}
          {state.periodLabel}
        </span>
        {detail?.outs !== undefined && live && (
          <span className="board-team">
            {detail.outs} out{detail.outs === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <TeamRow name={awayName} score={state.score.away} />
      <TeamRow name={homeName} score={state.score.home} />

      {live && detail?.balls !== undefined && (
        <div
          className="board-team"
          style={{ marginTop: '0.75rem', display: 'flex', gap: '1.25rem' }}
        >
          <span>
            {detail.balls}-{detail.strikes}
          </span>
          {detail.bases && <span>{basesLabel(detail.bases)}</span>}
        </div>
      )}
    </div>
  );
}

function TeamRow({ name, score }: { name: string; score: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1.5rem',
      }}
    >
      <span style={{ fontSize: 'var(--step-1)', fontWeight: 600 }}>{name}</span>
      <span className="board-score">{score}</span>
    </div>
  );
}

function basesLabel(bases: (string | null)[]): string {
  const on = bases.filter(Boolean).length;
  if (on === 0) return 'Bases empty';
  if (on === 3) return 'Bases loaded';
  const named = ['1st', '2nd', '3rd'].filter((_, i) => bases[i]);
  return `Runner${on > 1 ? 's' : ''} on ${named.join(' and ')}`;
}
