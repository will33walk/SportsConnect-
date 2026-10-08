import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/AuthForm';
import { signIn } from '@/lib/actions/auth';

export const metadata: Metadata = { title: 'Sign in · SportsConnect' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <>
      <h1 style={{ fontSize: 'var(--step-3)' }}>Sign in</h1>

      <AuthForm mode="signin" action={signIn} next={next} />

      <p style={{ marginTop: '2.5rem', color: 'var(--ink-soft)' }}>
        New here? <Link href="/signup">Create an account</Link>.
      </p>
    </>
  );
}
