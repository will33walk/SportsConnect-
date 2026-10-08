'use client';

import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/safe-action';
import { contrastingInk } from '@/lib/theme';

interface Props {
  action: (formData: FormData) => Promise<ActionResult<{ saved: true }>>;
  initialPrimary: string | null;
  initialAccent: string | null;
}

const DEFAULT_PRIMARY = '#2c5f7c';

export function BrandingForm({ action, initialPrimary, initialAccent }: Props) {
  const [primary, setPrimary] = useState(initialPrimary ?? DEFAULT_PRIMARY);

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; saved?: boolean } | null, formData: FormData) => {
      const result = await action(formData);
      return result.ok ? { saved: true } : { error: result.error };
    },
    null,
  );

  return (
    <form action={formAction}>
      <div className="field-row">
        <ColorField
          label="Main colour"
          name="brand_primary"
          value={primary}
          onChange={setPrimary}
          hint="Buttons and links."
        />
        <ColorField
          label="Accent"
          name="brand_accent"
          value={initialAccent ?? DEFAULT_PRIMARY}
          hint="Optional."
        />
      </div>

      {/* A live sample rather than a swatch. The question a league actually
          has is "does our colour look right on a button", and the contrast
          check that picks the label colour is easier to trust when you can
          see it working. */}
      <div style={{ marginTop: '2rem' }}>
        <p className="field-hint" style={{ marginBottom: '0.5rem' }}>
          How it will look
        </p>
        <span
          className="btn"
          style={{
            background: primary,
            color: contrastingInk(primary),
            display: 'inline-block',
          }}
        >
          Register
        </span>
      </div>

      {state?.error && (
        <p role="alert" style={{ color: 'var(--loss)', marginTop: '1.5rem' }}>
          {state.error}
        </p>
      )}
      {state?.saved && (
        <p role="status" style={{ color: 'var(--win)', marginTop: '1.5rem' }}>
          Saved.
        </p>
      )}

      <button className="btn" type="submit" disabled={pending} style={{ marginTop: '1.5rem' }}>
        {pending ? 'Saving…' : 'Save colours'}
      </button>
    </form>
  );
}

function ColorField({
  label,
  name,
  value,
  onChange,
  hint,
}: {
  label: string;
  name: string;
  value: string;
  onChange?: (v: string) => void;
  hint?: string;
}) {
  const [local, setLocal] = useState(value);
  const set = (v: string) => {
    setLocal(v);
    onChange?.(v);
  };

  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <input
          id={name}
          name={name}
          type="color"
          value={local}
          onChange={(e) => set(e.target.value)}
          style={{ width: '3rem', height: '2.25rem', padding: 0, border: 0, background: 'none' }}
        />
        {/* The hex is editable too: a league handed a brand colour by their
            school district has the code, not a swatch to eyeball. */}
        <input
          type="text"
          value={local}
          onChange={(e) => set(e.target.value)}
          aria-label={`${label} hex code`}
          style={{ maxWidth: '8rem' }}
        />
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
