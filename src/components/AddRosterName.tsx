'use client';

import { useActionState, useRef } from 'react';
import type { ActionResult } from '@/lib/safe-action';

export function AddRosterName({
  action,
}: {
  action: (formData: FormData) => Promise<ActionResult<{ ok: true }>>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const [error, formAction, pending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const result = await action(formData);
      // Reset so a captain can run down their whole roster in one sitting.
      if (result.ok) formRef.current?.reset();
      return result.ok ? null : result.error;
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} noValidate>
      <div className="field-row" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="roster-name">Name</label>
          <input id="roster-name" name="display_name" type="text" required />
        </div>
        <div className="field" style={{ flex: '0 1 6rem' }}>
          <label htmlFor="roster-number">Number</label>
          <input id="roster-number" name="jersey_number" type="text" inputMode="numeric" maxLength={4} />
        </div>
        <button className="btn" type="submit" disabled={pending} style={{ marginBottom: '0.5rem' }}>
          {pending ? 'Adding…' : 'Add'}
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
