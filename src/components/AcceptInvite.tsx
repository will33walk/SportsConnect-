'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { ActionResult } from '@/lib/safe-action';

/**
 * On success the action redirects, so the only state this renders is a
 * failure -- expired, withdrawn, already used. Those messages come from the
 * database function and are written for the person reading them, so they are
 * shown as-is rather than replaced with something generic.
 */
export function AcceptInvite({ action }: { action: () => Promise<ActionResult<never>> }) {
  const [error, formAction, pending] = useActionState(async () => {
    const result = await action();
    return result.ok ? null : result.error;
  }, null);

  if (error) {
    return (
      <div style={{ marginTop: '2rem' }}>
        <p role="alert" style={{ color: 'var(--loss)' }}>
          {error}
        </p>
        <p style={{ color: 'var(--ink-soft)' }}>
          Whoever sent this can create a new invitation for you.
        </p>
        <Link href="/app">Go to your leagues</Link>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <button className="btn" type="submit" disabled={pending} style={{ marginTop: '2rem' }}>
        {pending ? 'Joining…' : 'Accept invitation'}
      </button>
    </form>
  );
}
