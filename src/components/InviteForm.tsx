'use client';

import { useActionState } from 'react';
import type { ActionResult } from '@/lib/safe-action';
import type { OrgRole } from '@/lib/auth';

interface Props {
  action: (formData: FormData) => Promise<ActionResult<{ email: string }>>;
  /** Roles this person may hand out — an admin can't mint an owner. */
  roles: { value: OrgRole; label: string; description: string }[];
}

export function InviteForm({ action, roles }: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; sent?: string } | null, formData: FormData) => {
      const result = await action(formData);
      return result.ok ? { sent: result.data.email } : { error: result.error };
    },
    null,
  );

  return (
    <form action={formAction} noValidate>
      <div className="field-row">
        <div className="field">
          <label htmlFor="invite-email">Email</label>
          <input
            id="invite-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            placeholder="pat@example.com"
          />
        </div>

        <div className="field">
          <label htmlFor="invite-role">What they can do</label>
          <select id="invite-role" name="role" defaultValue="league_manager">
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="field-hint">
            {/* Shown for every option rather than only the selected one would
                be noise; this is the common case and the rest are listed
                below the form. */}
            You can change this later.
          </p>
        </div>
      </div>

      {state?.error && (
        <p role="alert" style={{ color: 'var(--loss)', marginTop: '1rem' }}>
          {state.error}
        </p>
      )}
      {state?.sent && (
        <p role="status" style={{ color: 'var(--win)', marginTop: '1rem' }}>
          Invitation ready for {state.sent}. Copy the link from the list below
          and send it to them.
        </p>
      )}

      <button className="btn" type="submit" disabled={pending} style={{ marginTop: '1.5rem' }}>
        {pending ? 'Creating…' : 'Create invitation'}
      </button>
    </form>
  );
}
