'use client';

import { useActionState, useRef } from 'react';
import type { ActionResult } from '@/lib/safe-action';

export function InviteTeammate({
  action,
}: {
  action: (formData: FormData) => Promise<ActionResult<{ email: string }>>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; sent?: string } | null, formData: FormData) => {
      const result = await action(formData);
      if (result.ok) formRef.current?.reset();
      return result.ok ? { sent: result.data.email } : { error: result.error };
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} noValidate>
      <div className="field-row" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="teammate-email">Their email</label>
          <input id="teammate-email" name="email" type="email" inputMode="email" required />
        </div>
        <button className="btn" type="submit" disabled={pending} style={{ marginBottom: '0.5rem' }}>
          {pending ? 'Adding…' : 'Invite'}
        </button>
      </div>

      {state?.error && (
        <p role="alert" style={{ color: 'var(--loss)' }}>
          {state.error}
        </p>
      )}
      {state?.sent && (
        <p role="status" style={{ color: 'var(--win)' }}>
          Invitation ready for {state.sent}. Grab the link from the league&rsquo;s
          people page and send it along.
        </p>
      )}
    </form>
  );
}
