'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/safe-action';

interface Candidate {
  userId: string;
  name: string;
  cleared: boolean;
  missingCount: number;
}

interface Props {
  action: (
    userId: string,
    role: 'head' | 'assistant' | 'captain',
  ) => Promise<ActionResult<{ ok: true }>>;
  candidates: Candidate[];
  youth: boolean;
  manageHref: string;
}

/**
 * Who can be put on this team, and who can't yet.
 *
 * Blocked coaches are listed rather than filtered out. Hiding them would make
 * the list look complete and send a league director hunting for someone who
 * applied three weeks ago; showing them with what's outstanding turns a
 * mystery into a task.
 */
export function AssignCoach({ action, candidates, youth, manageHref }: Props) {
  const cleared = candidates.filter((c) => !youth || c.cleared);
  const blocked = youth ? candidates.filter((c) => !c.cleared) : [];

  const [selected, setSelected] = useState('');
  const [role, setRole] = useState<'head' | 'assistant' | 'captain'>('head');

  const [error, formAction, pending] = useActionState(async () => {
    if (!selected) return 'Pick someone.';
    const result = await action(selected, role);
    if (result.ok) setSelected('');
    return result.ok ? null : result.error;
  }, null);

  if (candidates.length === 0) {
    return (
      <p style={{ color: 'var(--ink-soft)' }}>
        Nobody&rsquo;s available to assign. <Link href={manageHref}>Approve a coach</Link> first.
      </p>
    );
  }

  return (
    <>
      {cleared.length > 0 && (
        <form action={formAction}>
          <div className="field-row" style={{ alignItems: 'flex-end' }}>
            <div className="field">
              <label htmlFor="coach">Add a coach</label>
              <select
                id="coach"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                required
              >
                <option value="">Choose someone</option>
                {cleared.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ flex: '0 1 10rem' }}>
              <label htmlFor="coach-role">As</label>
              <select
                id="coach-role"
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                <option value="head">Head coach</option>
                <option value="assistant">Assistant</option>
                <option value="captain">Captain</option>
              </select>
            </div>

            <button
              className="btn"
              type="submit"
              disabled={pending || !selected}
              style={{ marginBottom: '0.5rem' }}
            >
              {pending ? 'Adding…' : 'Add'}
            </button>
          </div>

          {error && (
            <p role="alert" style={{ color: 'var(--loss)' }}>
              {error}
            </p>
          )}
        </form>
      )}

      {blocked.length > 0 && (
        <div style={{ marginTop: cleared.length > 0 ? '2rem' : 0 }}>
          <p style={{ color: 'var(--ink-soft)', marginBottom: '0.5rem' }}>
            Approved, but not yet able to be on a youth team:
          </p>
          <div className="ruled" style={{ borderTop: '1px solid var(--rule)' }}>
            {blocked.map((c) => (
              <div key={c.userId} className="row" style={{ justifyContent: 'space-between' }}>
                <span>{c.name}</span>
                <Link
                  href={`${manageHref}/${c.userId}`}
                  style={{ fontSize: 'var(--step--1)', whiteSpace: 'nowrap' }}
                >
                  {c.missingCount} outstanding
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
