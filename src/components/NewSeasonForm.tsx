'use client';

import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/safe-action';
import type { RosterModel } from '@/lib/season-data';

interface Props {
  action: (formData: FormData) => Promise<ActionResult<never>>;
  sports: { key: string; label: string }[];
  /** Set when this is a division being added under an existing league. */
  parent?: { id: string; title: string } | null;
}

// Written as what a league director would say out loud, not as the enum.
const MODELS: { value: RosterModel; label: string; blurb: string }[] = [
  {
    value: 'assigned',
    label: 'We put players on teams',
    blurb: 'Everyone registers, then you place them — balancing by age, school or who carpools together. T-ball and the younger divisions.',
  },
  {
    value: 'draft',
    label: 'Coaches draft players',
    blurb: 'Everyone registers into a pool and coaches pick, live or on their own time. The older divisions.',
  },
  {
    value: 'team_registration',
    label: 'Teams sign up whole',
    blurb: 'A captain registers and pays for the team, then invites their own players. Adult leagues.',
  },
];

export function NewSeasonForm({ action, sports, parent }: Props) {
  const [model, setModel] = useState<RosterModel>('assigned');
  const [involvesMinors, setInvolvesMinors] = useState(true);
  const [touchedMinors, setTouchedMinors] = useState(false);

  const [error, formAction, pending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const result = await action(formData);
      return result.ok ? null : result.error;
    },
    null,
  );

  // Teams signing up whole is overwhelmingly adult rec. Follow the choice
  // until they say otherwise, then stop guessing -- a youth travel club that
  // registers by team exists and shouldn't be fought with.
  function pickModel(next: RosterModel) {
    setModel(next);
    if (!touchedMinors) setInvolvesMinors(next !== 'team_registration');
  }

  return (
    <form action={formAction} noValidate>
      {parent && <input type="hidden" name="parent_program_id" value={parent.id} />}

      <div className="field">
        <label htmlFor="title">{parent ? 'Division name' : 'Season name'}</label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder={parent ? '8u' : 'Spring 2027 — 10u Baseball'}
        />
        <p className="field-hint">
          {parent
            ? 'What families call this age group — “8u”, “T-ball”, “Junior Varsity”.'
            : 'Include the year and division — families will see this.'}
        </p>
      </div>

      <div className="field">
        <label htmlFor="sport_key">Sport</label>
        <select id="sport_key" name="sport_key" required defaultValue="">
          <option value="" disabled>
            Choose a sport
          </option>
          {sports.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: '2rem 0 0' }}>
        <legend style={{ fontWeight: 600, color: 'var(--ink-soft)', fontSize: 'var(--step--1)' }}>
          How players get on teams
        </legend>
        <p className="field-hint" style={{ marginTop: '0.25rem' }}>
          This decides what registration does and can&rsquo;t be changed once
          the season is running.
        </p>

        <div className="ruled" style={{ marginTop: '0.75rem', borderTop: '1px solid var(--rule)' }}>
          {MODELS.map((m) => (
            <label
              key={m.value}
              className="row"
              style={{ alignItems: 'flex-start', cursor: 'pointer' }}
            >
              <input
                type="radio"
                name="roster_model"
                value={m.value}
                checked={model === m.value}
                onChange={() => pickModel(m.value)}
                style={{ marginTop: '0.4rem' }}
              />
              <span>
                <strong>{m.label}</strong>
                <br />
                <span style={{ color: 'var(--ink-soft)', fontSize: 'var(--step--1)' }}>
                  {m.blurb}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label
          htmlFor="involves_minors"
          style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}
        >
          <input
            id="involves_minors"
            name="involves_minors"
            type="checkbox"
            checked={involvesMinors}
            onChange={(e) => {
              setTouchedMinors(true);
              setInvolvesMinors(e.target.checked);
            }}
            style={{ marginTop: '0.25rem' }}
          />
          <span style={{ fontWeight: 400, color: 'var(--ink)' }}>
            This is a youth season
            <br />
            <span style={{ color: 'var(--ink-soft)', fontSize: 'var(--step--1)' }}>
              Coaches must finish your requirements before they can be put on a
              team, and public pages show first names with a last initial.
            </span>
          </span>
        </label>
      </div>

      <div className="field-row" style={{ marginTop: '1rem' }}>
        <div className="field">
          <label htmlFor="starts_on">First day</label>
          <input id="starts_on" name="starts_on" type="date" />
        </div>
        <div className="field">
          <label htmlFor="ends_on">Last day</label>
          <input id="ends_on" name="ends_on" type="date" />
        </div>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--loss)', marginTop: '1.5rem' }}>
          {error}
        </p>
      )}

      <button className="btn" type="submit" disabled={pending} style={{ marginTop: '2rem' }}>
        {pending ? 'Creating…' : 'Create season'}
      </button>
    </form>
  );
}
