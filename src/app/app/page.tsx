import Link from 'next/link';
import type { Metadata } from 'next';
import { myMemberships, type OrgRole } from '@/lib/auth';
import { signOut } from '@/lib/actions/auth';

export const metadata: Metadata = { title: 'Your leagues · SportsConnect' };

// What a role means to the person holding it, in their words rather than the
// schema's. Nobody thinks of themselves as a "league_manager".
const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'You run this league',
  admin: 'You help run this league',
  league_manager: 'You manage a league here',
  coach: 'You coach here',
  member: 'Your family plays here',
};

export default async function AppHome() {
  const memberships = await myMemberships();

  // A form action has to resolve to void; signOut returns an ActionResult and
  // redirects on success, so there is nothing to hand back.
  async function doSignOut() {
    'use server';
    await signOut();
  }

  return (
    <div className="shell" style={{ maxWidth: '44rem', paddingBlock: 'clamp(2.5rem, 8vh, 5rem)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '1rem',
        }}
      >
        <h1 style={{ fontSize: 'var(--step-3)' }}>Your leagues</h1>
        <form action={doSignOut}>
          <button
            type="submit"
            className="btn btn-quiet"
            style={{ padding: '0.35rem 0.75rem', fontSize: 'var(--step--1)' }}
          >
            Sign out
          </button>
        </form>
      </div>

      {memberships.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="ruled rule-heavy" style={{ marginTop: '2rem' }}>
            {memberships.map((m) => (
              <Link
                key={m.organizationId}
                href={canManage(m.role) ? `/manage/${m.organizationSlug}` : `/l/${m.organizationSlug}`}
                className="row"
                style={{ justifyContent: 'space-between', textDecoration: 'none' }}
              >
                <span>
                  <span style={{ fontWeight: 600, fontStretch: '125%', fontSize: 'var(--step-1)' }}>
                    {m.organizationName}
                  </span>
                  <br />
                  <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                    {ROLE_LABEL[m.role]}
                  </span>
                </span>
                <span aria-hidden style={{ color: 'var(--ink-faint)' }}>
                  /l/{m.organizationSlug}
                </span>
              </Link>
            ))}
          </div>

          <p style={{ marginTop: '2rem' }}>
            <Link href="/app/new">Start another league</Link>
          </p>
        </>
      )}
    </div>
  );
}

const canManage = (role: OrgRole) =>
  role === 'owner' || role === 'admin' || role === 'league_manager';

// An empty screen is an invitation, not a dead end. Two routes in, because
// the person reading this is either starting a league or waiting to be let
// into one, and those need different next steps.
function Empty() {
  return (
    <div style={{ marginTop: '2rem' }}>
      <p style={{ color: 'var(--ink-soft)' }}>
        You&rsquo;re not part of a league yet.
      </p>
      <p style={{ color: 'var(--ink-soft)' }}>
        If you run one, start it here. If someone else runs yours, ask them to
        invite this email address and it will show up on this page.
      </p>
      <Link className="btn" href="/app/new" style={{ display: 'inline-block', marginTop: '1rem' }}>
        Start a league
      </Link>
    </div>
  );
}
