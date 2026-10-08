import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { currentUserId } from '@/lib/auth';
import { acceptInvitation } from '@/lib/actions/people';
import { AcceptInvite } from '@/components/AcceptInvite';

export const metadata: Metadata = { title: 'Your invitation · SportsConnect' };

/**
 * The page an invitation link lands on.
 *
 * It deliberately shows nothing about the invitation before sign-in -- not
 * the league's name, not the role, not who sent it. A token in a forwarded
 * text message shouldn't tell a stranger anything, and the accept function is
 * the only thing that reads the row.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const signedIn = Boolean(await currentUserId());

  if (!signedIn) {
    // Come back here once they have an account. The token stays in the path,
    // and `next` only ever carries a same-origin path.
    redirect(`/signup?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const accept = acceptInvitation.bind(null, token);

  return (
    <div className="shell" style={{ maxWidth: '32rem', paddingBlock: 'clamp(3rem, 12vh, 7rem)' }}>
      <Link
        href="/"
        style={{ fontWeight: 700, fontStretch: '125%', fontSize: 'var(--step-1)', textDecoration: 'none' }}
      >
        SportsConnect
      </Link>

      <h1 style={{ fontSize: 'var(--step-3)', marginTop: '3rem' }}>
        You&rsquo;ve been invited
      </h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: '0.75rem' }}>
        Accepting adds this league to your account.
      </p>

      <AcceptInvite action={accept} />
    </div>
  );
}
