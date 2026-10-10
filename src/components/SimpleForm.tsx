'use client';

import { useActionState, useRef } from 'react';
import type { ActionResult } from '@/lib/safe-action';

export interface SimpleField {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'select' | 'checkbox';
  placeholder?: string;
  required?: boolean;
  width?: string;
  options?: { value: string; label: string }[];
}

/**
 * A row of fields and a submit button, for the many small "add one of these"
 * forms a league manager fills in repeatedly: a price option, a discount
 * code, a requirement.
 *
 * Resets on success, because these are always used several times in a row.
 */
export function SimpleForm({
  action,
  fields,
  submitLabel,
  hint,
}: {
  action: (formData: FormData) => Promise<ActionResult<{ ok: true }>>;
  fields: SimpleField[];
  submitLabel: string;
  hint?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const [error, formAction, pending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const result = await action(formData);
      if (result.ok) formRef.current?.reset();
      return result.ok ? null : result.error;
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} noValidate>
      <div className="field-row" style={{ alignItems: 'flex-end' }}>
        {fields.map((f) => (
          <div
            key={f.name}
            className="field"
            style={f.width ? { flex: `0 1 ${f.width}` } : undefined}
          >
            {f.type === 'checkbox' ? (
              <label
                htmlFor={f.name}
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 400, color: 'var(--ink)' }}
              >
                <input id={f.name} name={f.name} type="checkbox" />
                <span>{f.label}</span>
              </label>
            ) : (
              <>
                <label htmlFor={f.name}>{f.label}</label>
                {f.type === 'select' ? (
                  <select id={f.name} name={f.name} defaultValue={f.options?.[0]?.value}>
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={f.name}
                    name={f.name}
                    type={f.type === 'date' ? 'date' : 'text'}
                    placeholder={f.placeholder}
                    required={f.required}
                  />
                )}
              </>
            )}
          </div>
        ))}

        <button className="btn" type="submit" disabled={pending} style={{ marginBottom: '0.5rem' }}>
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>

      {hint && <p className="field-hint">{hint}</p>}

      {error && (
        <p role="alert" style={{ color: 'var(--loss)' }}>
          {error}
        </p>
      )}
    </form>
  );
}
