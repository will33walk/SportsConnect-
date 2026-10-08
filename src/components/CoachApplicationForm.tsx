'use client';

import { useActionState } from 'react';
import type { ActionResult } from '@/lib/safe-action';

export function CoachApplicationForm({
  action,
}: {
  action: (formData: FormData) => Promise<ActionResult<{ ok: true }>>;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; sent?: boolean } | null, formData: FormData) => {
      const result = await action(formData);
      return result.ok ? { sent: true } : { error: result.error };
    },
    null,
  );

  if (state?.sent) {
    return (
      <p role="status" style={{ marginTop: '2rem' }}>
        Thanks — your application is in. Someone from the league will be in
        touch.
      </p>
    );
  }

  return (
    <form action={formAction} style={{ marginTop: '2rem' }}>
      <div className="field">
        <label htmlFor="phone">Phone</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" />
        <p className="field-hint">How the league reaches you about games.</p>
      </div>

      <div className="field">
        <label htmlFor="experience">Anything we should know</label>
        <textarea
          id="experience"
          name="experience"
          rows={5}
          placeholder="Coached my son's team the last two years, played through high school. Happy with any age group."
        />
        <p className="field-hint">
          Experience, which age groups suit you, whether you&rsquo;d rather
          assist than lead. Nothing formal.
        </p>
      </div>

      {state?.error && (
        <p role="alert" style={{ color: 'var(--loss)', marginTop: '1rem' }}>
          {state.error}
        </p>
      )}

      <button className="btn" type="submit" disabled={pending} style={{ marginTop: '1.5rem' }}>
        {pending ? 'Sending…' : 'Apply to coach'}
      </button>
    </form>
  );
}
