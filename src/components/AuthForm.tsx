'use client';

import { useActionState } from 'react';
import type { ActionResult } from '@/lib/safe-action';

type Action = (formData: FormData) => Promise<ActionResult<never>>;

interface Props {
  mode: 'signin' | 'signup';
  action: Action;
  next?: string;
}

// On success these actions redirect, so the only state this form ever renders
// is a failure. `useActionState` is what keeps the typed values in the inputs
// when that happens -- making someone retype their email because their
// password was wrong is a small cruelty that forms commit constantly.
export function AuthForm({ mode, action, next }: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const result = await action(formData);
      return result.ok ? null : result.error;
    },
    null,
  );

  const signup = mode === 'signup';

  return (
    <form action={formAction} noValidate>
      {next && <input type="hidden" name="next" value={next} />}

      {signup && (
        <Field label="Your name" name="full_name" type="text" autoComplete="name" required />
      )}

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
      />

      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={signup ? 'new-password' : 'current-password'}
        hint={signup ? 'At least 8 characters.' : undefined}
        required
      />

      {state && (
        <p role="alert" style={{ color: 'var(--loss)', marginTop: '1rem' }}>
          {state}
        </p>
      )}

      <button className="btn" type="submit" disabled={pending} style={{ marginTop: '1.5rem' }}>
        {pending ? (signup ? 'Creating account…' : 'Signing in…') : signup ? 'Create account' : 'Sign in'}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  hint,
  ...input
}: {
  label: string;
  name: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} aria-describedby={hintId} {...input} />
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
