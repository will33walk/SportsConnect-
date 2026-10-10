'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/safe-action';
import type { BlastScope } from '@/lib/actions/announcements';

export interface BlastSeason {
  id: string;
  title: string;
  /** Set when this is a division, so the picker can show the hierarchy. */
  parentTitle: string | null;
  isParent: boolean;
}

export interface BlastTeam {
  id: string;
  name: string;
  seasonTitle: string;
}

interface Props {
  send: (formData: FormData) => Promise<ActionResult<{ recipients: number }>>;
  preview: (
    scope: BlastScope,
    programId: string | null,
    teamIds: string[],
  ) => Promise<ActionResult<{ count: number }>>;
  seasons: BlastSeason[];
  teams: BlastTeam[];
  orgName: string;
}

export function BlastComposer({ send, preview, seasons, teams, orgName }: Props) {
  const [scope, setScope] = useState<BlastScope>('organization');
  const [programId, setProgramId] = useState(seasons[0]?.id ?? '');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [, startCounting] = useTransition();

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; sent?: number } | null, formData: FormData) => {
      const result = await send(formData);
      return result.ok ? { sent: result.data.recipients } : { error: result.error };
    },
    null,
  );

  // Recount whenever the audience changes. The number is the thing that makes
  // someone think twice before sending to a whole league.
  useEffect(() => {
    if (scope === 'program' && !programId) return;
    if (scope === 'teams' && teamIds.length === 0) {
      setCount(0);
      return;
    }

    let cancelled = false;
    startCounting(async () => {
      const result = await preview(scope, scope === 'program' ? programId : null, teamIds);
      if (!cancelled) setCount(result.ok ? result.data.count : null);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, programId, teamIds, preview]);

  if (state?.sent !== undefined) {
    return (
      <p role="status" style={{ color: 'var(--win)' }}>
        Sent to {state.sent} {state.sent === 1 ? 'person' : 'people'}.
      </p>
    );
  }

  const toggleTeam = (id: string) =>
    setTeamIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // Grouped so a league with divisions reads as a hierarchy rather than a
  // flat list of eleven similar names.
  const bySeason = new Map<string, BlastTeam[]>();
  for (const t of teams) {
    const list = bySeason.get(t.seasonTitle) ?? [];
    list.push(t);
    bySeason.set(t.seasonTitle, list);
  }

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="scope" value={scope} />
      {scope === 'program' && <input type="hidden" name="program_id" value={programId} />}
      {scope === 'teams' &&
        teamIds.map((id) => <input key={id} type="hidden" name="team_ids" value={id} />)}

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, color: 'var(--ink-soft)', fontSize: 'var(--step--1)' }}>
          Who gets this?
        </legend>

        <div className="ruled" style={{ borderTop: '1px solid var(--rule)', marginTop: '0.5rem' }}>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input
              type="radio"
              checked={scope === 'organization'}
              onChange={() => setScope('organization')}
            />
            <span>Everyone in {orgName}</span>
          </label>

          {seasons.length > 0 && (
            <label className="row" style={{ cursor: 'pointer' }}>
              <input
                type="radio"
                checked={scope === 'program'}
                onChange={() => setScope('program')}
              />
              <span>One season or division</span>
            </label>
          )}

          {teams.length > 0 && (
            <label className="row" style={{ cursor: 'pointer' }}>
              <input type="radio" checked={scope === 'teams'} onChange={() => setScope('teams')} />
              <span>Picked teams</span>
            </label>
          )}
        </div>
      </fieldset>

      {scope === 'program' && (
        <div className="field">
          <label htmlFor="blast-program">Season or division</label>
          <select
            id="blast-program"
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.parentTitle ? `${s.parentTitle} — ${s.title}` : s.title}
                {s.isParent ? ' (every division)' : ''}
              </option>
            ))}
          </select>
          <p className="field-hint">
            Choosing a parent league reaches every division under it.
          </p>
        </div>
      )}

      {scope === 'teams' && (
        <div style={{ marginTop: '1.5rem' }}>
          {[...bySeason.entries()].map(([seasonTitle, list]) => (
            <fieldset key={seasonTitle} style={{ border: 0, padding: 0, margin: '0 0 1.25rem' }}>
              <legend
                style={{ fontSize: 'var(--step--1)', fontWeight: 600, color: 'var(--ink-soft)' }}
              >
                {seasonTitle}
              </legend>
              <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.4rem' }}>
                {list.map((t) => (
                  <label key={t.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={teamIds.includes(t.id)}
                      onChange={() => toggleTeam(t.id)}
                    />
                    <span>{t.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <div className="field">
        <label htmlFor="blast-subject">Subject</label>
        <input id="blast-subject" name="subject" type="text" required maxLength={160} />
      </div>

      <div className="field">
        <label htmlFor="blast-body">Message</label>
        <textarea id="blast-body" name="body" rows={7} required maxLength={8000} />
      </div>

      {state?.error && (
        <p role="alert" style={{ color: 'var(--loss)', marginTop: '1rem' }}>
          {state.error}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginTop: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <button className="btn" type="submit" disabled={pending || count === 0}>
          {pending ? 'Sending…' : 'Send'}
        </button>
        <span style={{ color: count === 0 ? 'var(--ink-faint)' : 'var(--ink-soft)' }}>
          {count === null
            ? ''
            : count === 0
              ? 'Nobody to send to yet.'
              : `Goes to ${count} ${count === 1 ? 'person' : 'people'}.`}
        </span>
      </div>
    </form>
  );
}
