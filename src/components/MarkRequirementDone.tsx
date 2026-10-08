'use client';

import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/safe-action';

/**
 * Records that a requirement was satisfied, on a date.
 *
 * The date matters and isn't always today: a league entering last spring's
 * background checks needs the real date, because that is what expiry counts
 * from. So this is a two-step — click, then confirm a date — rather than a
 * one-tap "done" that would quietly stamp today on everything.
 */
export function MarkRequirementDone({
  action,
}: {
  action: (completedOn: string) => Promise<ActionResult<{ ok: true }>>;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const [error, formAction, pending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const result = await action(String(formData.get('completed_on') ?? ''));
      return result.ok ? null : result.error;
    },
    null,
  );

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => setOpen(true)}
        style={{ padding: '0.3rem 0.65rem', fontSize: 'var(--step--1)', whiteSpace: 'nowrap' }}
      >
        Mark done
      </button>
    );
  }

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.5rem', justifyItems: 'end' }}>
      <input
        type="date"
        name="completed_on"
        defaultValue={today}
        max={today}
        aria-label="Date completed"
        required
        style={{
          font: 'inherit',
          fontSize: 'var(--step--1)',
          padding: '0.25rem',
          background: 'transparent',
          color: 'var(--ink)',
          border: '1px solid var(--rule-strong)',
          borderRadius: 'var(--radius)',
        }}
      />
      <span style={{ display: 'flex', gap: '0.4rem' }}>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => setOpen(false)}
          style={{ padding: '0.3rem 0.65rem', fontSize: 'var(--step--1)' }}
        >
          Cancel
        </button>
        <button
          className="btn"
          type="submit"
          disabled={pending}
          style={{ padding: '0.3rem 0.65rem', fontSize: 'var(--step--1)' }}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </span>
      {error && (
        <span role="alert" style={{ color: 'var(--loss)', fontSize: 'var(--step--1)' }}>
          {error}
        </span>
      )}
    </form>
  );
}
