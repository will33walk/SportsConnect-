import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/AuthForm';
import { signUp } from '@/lib/actions/auth';

export const metadata: Metadata = { title: 'Create an account · SportsConnect' };

export default function SignUpPage() {
  return (
    <>
      <h1 style={{ fontSize: 'var(--step-3)' }}>Create an account</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: '0.75rem' }}>
        One account works for every league you&rsquo;re part of — whether you run
        one, coach in one, or have a kid playing in one.
      </p>

      <AuthForm mode="signup" action={signUp} />

      <p style={{ marginTop: '2.5rem', color: 'var(--ink-soft)' }}>
        Already have an account? <Link href="/signin">Sign in</Link>.
      </p>
    </>
  );
}
