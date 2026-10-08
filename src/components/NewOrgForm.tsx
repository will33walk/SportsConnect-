'use client';

import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/safe-action';
import { slugify, validateSlug } from '@/lib/slug';

interface Props {
  action: (formData: FormData) => Promise<ActionResult<never>>;
  /** Guess from the browser, so most people never touch the field. */
  defaultTimezone: string;
}

export function NewOrgForm({ action, defaultTimezone }: Props) {
  const [name, setName] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState('');

  const [error, formAction, pending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const result = await action(formData);
      return result.ok ? null : result.error;
    },
    null,
  );

  // Until someone edits the address themselves, it tracks the name. After
  // that it is theirs and we stop overwriting it -- a field that keeps
  // rewriting what you typed is infuriating.
  const effectiveSlug = slugTouched ? slugify(slug) : slugify(name);
  const slugProblem = effectiveSlug ? validateSlug(effectiveSlug) : null;

  return (
    <form action={formAction} noValidate>
      <div className="field">
        <label htmlFor="name">League name</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Michigan City Youth Baseball"
        />
      </div>

      <div className="field">
        <label htmlFor="slug">Web address</label>
        <input
          id="slug"
          name="slug"
          type="text"
          value={slugTouched ? slug : effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          aria-describedby="slug-hint"
          placeholder="mcybl"
        />
        <p id="slug-hint" className="field-hint">
          {effectiveSlug ? (
            <>
              Your league will live at <strong>/l/{effectiveSlug}</strong>
            </>
          ) : (
            'Taken from the name unless you change it.'
          )}
        </p>
        {slugProblem && (
          <p className="field-hint" style={{ color: 'var(--loss)' }}>
            {slugProblem}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="timezone">Time zone</label>
        <input
          id="timezone"
          name="timezone"
          type="text"
          defaultValue={defaultTimezone}
          aria-describedby="tz-hint"
        />
        <p id="tz-hint" className="field-hint">
          Game times are shown in this zone.
        </p>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--loss)', marginTop: '1.5rem' }}>
          {error}
        </p>
      )}

      <button
        className="btn"
        type="submit"
        disabled={pending || !name || Boolean(slugProblem)}
        style={{ marginTop: '2rem' }}
      >
        {pending ? 'Creating…' : 'Create league'}
      </button>
    </form>
  );
}
