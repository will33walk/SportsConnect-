'use client';

import { useActionState, useRef, useState } from 'react';
import type { ActionResult } from '@/lib/safe-action';

interface Props {
  action: (formData: FormData) => Promise<ActionResult<{ warning: string | null }>>;
  teams: { id: string; name: string }[];
}

/**
 * One game, by hand.
 *
 * Sits alongside the generator rather than replacing it: the generator lays
 * out a season, and this handles everything after — a makeup for a rainout, a
 * scrimmage, a bracket worked out on paper, the Thursday a team plays twice.
 */
export function AddGameForm({ action, teams }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<'game' | 'practice'>('game');

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; warning?: string | null } | null, formData: FormData) => {
      const result = await action(formData);
      if (result.ok) {
        formRef.current?.reset();
        setKind('game');
        return { warning: result.data.warning };
      }
      return { error: result.error };
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} noValidate>
      <input type="hidden" name="session_type" value={kind} />

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
        {(['game', 'practice'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={kind === k ? 'btn' : 'btn btn-quiet'}
            style={{ padding: '0.35rem 0.7rem', fontSize: 'var(--step--1)' }}
          >
            {k === 'game' ? 'Game' : 'Practice'}
          </button>
        ))}
      </div>

      <div className="field-row" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="away_team_id">{kind === 'game' ? 'Away' : 'Team'}</label>
          <select
            id={kind === 'game' ? 'away_team_id' : 'home_team_id'}
            name={kind === 'game' ? 'away_team_id' : 'home_team_id'}
            required
            defaultValue=""
          >
            <option value="" disabled>
              Choose
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {kind === 'game' && (
          <div className="field">
            <label htmlFor="home_team_id">Home</label>
            <select id="home_team_id" name="home_team_id" required defaultValue="">
              <option value="" disabled>
                Choose
              </option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="field-row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '0 1 11rem' }}>
          <label htmlFor="game_date">Date</label>
          <input id="game_date" name="date" type="date" required />
        </div>
        <div className="field" style={{ flex: '0 1 8rem' }}>
          <label htmlFor="game_time">Start</label>
          <input id="game_time" name="time" type="time" required />
        </div>
        <div className="field">
          <label htmlFor="game_location">Field</label>
          <input id="game_location" name="location_name" type="text" placeholder="Field 1" />
        </div>
        <button className="btn" type="submit" disabled={pending} style={{ marginBottom: '0.5rem' }}>
          {pending ? 'Adding…' : 'Add'}
        </button>
      </div>

      {state?.error && (
        <p role="alert" style={{ color: 'var(--loss)' }}>
          {state.error}
        </p>
      )}
      {state?.warning && (
        <p role="status" style={{ color: 'var(--ink-soft)' }}>
          {state.warning}
        </p>
      )}
    </form>
  );
}
