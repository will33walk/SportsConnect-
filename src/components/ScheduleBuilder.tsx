'use client';

import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/safe-action';

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

interface Props {
  action: (formData: FormData) => Promise<ActionResult<{ created: number }>>;
  teamCount: number;
  defaultStart: string;
}

export function ScheduleBuilder({ action, teamCount, defaultStart }: Props) {
  const [days, setDays] = useState<number[]>([2]);

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; created?: number } | null, formData: FormData) => {
      const result = await action(formData);
      return result.ok ? { created: result.data.created } : { error: result.error };
    },
    null,
  );

  if (state?.created) {
    return (
      <p role="status" style={{ color: 'var(--win)' }}>
        {state.created} games scheduled. They&rsquo;re below — publish the
        schedule when you&rsquo;re happy with it.
      </p>
    );
  }

  const toggle = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <form action={formAction} noValidate>
      {/* Hidden inputs because the day buttons are toggles, not checkboxes —
          a row of seven checkboxes is a worse control for "which nights do we
          have the field" than a row of day chips. */}
      {days.map((d) => (
        <input key={d} type="hidden" name="weekdays" value={d} />
      ))}

      <div className="field">
        <span style={{ display: 'block', fontSize: 'var(--step--1)', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '0.5rem' }}>
          Which nights do you have the field?
        </span>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {DAYS.map((d) => {
            const on = days.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggle(d.value)}
                aria-pressed={on}
                className={on ? 'btn' : 'btn btn-quiet'}
                style={{ padding: '0.4rem 0.7rem', fontSize: 'var(--step--1)' }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="start_date">First game</label>
          <input id="start_date" name="start_date" type="date" defaultValue={defaultStart} required />
        </div>
        <div className="field">
          <label htmlFor="times_through">Times each team plays the others</label>
          <input
            id="times_through"
            name="times_through"
            type="number"
            min={1}
            max={4}
            defaultValue={2}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="game_times">Start times</label>
        <input id="game_times" name="game_times" type="text" defaultValue="18:00, 19:30" required />
        <p className="field-hint">
          24-hour, separated by commas. 18:00 is 6pm.
        </p>
      </div>

      <div className="field">
        <label htmlFor="locations">Fields</label>
        <input id="locations" name="locations" type="text" defaultValue="Field 1" required />
        <p className="field-hint">
          Separated by commas. Two fields means twice as many games a night.
        </p>
      </div>

      {state?.error && (
        <p role="alert" style={{ color: 'var(--loss)', marginTop: '1.5rem' }}>
          {state.error}
        </p>
      )}

      <button
        className="btn"
        type="submit"
        disabled={pending || teamCount < 2 || days.length === 0}
        style={{ marginTop: '1.5rem' }}
      >
        {pending ? 'Building…' : 'Build the schedule'}
      </button>

      {teamCount < 2 && (
        <p className="field-hint" style={{ marginTop: '0.75rem' }}>
          Add at least two teams first.
        </p>
      )}
    </form>
  );
}
