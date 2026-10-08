import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/AuthForm';
import { signUp } from '@/lib/actions/auth';

export const metadata: Metadata = { title: 'Create an account · SportsConnect' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const invited = next?.startsWith('/invite/');

  return (
    <>
      <h1 style={{ fontSize: 'var(--step-3)' }}>
        {invited ? 'Make an account to accept' : 'Create an account'}
      </h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: '0.75rem' }}>
        One account works for every league you&rsquo;re part of — whether you run
        one, coach in one, or have a kid playing in one.
      </p>

      <AuthForm mode="signup" action={signUp} next={next} />

      <p style={{ marginTop: '2.5rem', color: 'var(--ink-soft)' }}>
        Already have an account?{' '}
        <Link href={next ? `/signin?next=${encodeURIComponent(next)}` : '/signin'}>Sign in</Link>.
      </p>
    </>
  );
}
