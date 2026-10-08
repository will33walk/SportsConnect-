'use client';

import { useActionState, useRef } from 'react';
import type { ActionResult } from '@/lib/safe-action';

export function AddTeamForm({
  action,
}: {
  action: (formData: FormData) => Promise<ActionResult<{ ok: true }>>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const [error, formAction, pending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const result = await action(formData);
      // Clear on success so the next team can be typed straight in. Adding
      // teams is a run of eight or ten in one sitting, not a single act.
      if (result.ok) formRef.current?.reset();
      return result.ok ? null : result.error;
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} noValidate>
      <div className="field-row" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="team-name">Team name</label>
          <input id="team-name" name="name" type="text" required placeholder="Rivercats" />
        </div>
        <div className="field" style={{ flex: '0 0 auto' }}>
          <label htmlFor="team-color">Colour</label>
          <input
            id="team-color"
            name="color"
            type="color"
            defaultValue="#2c5f7c"
            style={{ width: '3rem', height: '2.25rem', padding: 0, border: 0, background: 'none' }}
          />
        </div>
        <button className="btn" type="submit" disabled={pending} style={{ marginBottom: '0.5rem' }}>
          {pending ? 'Adding…' : 'Add team'}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--loss)' }}>
          {error}
        </p>
      )}
    </form>
  );
}
