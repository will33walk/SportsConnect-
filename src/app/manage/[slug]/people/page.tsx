import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { InviteForm } from '@/components/InviteForm';
import { CopyButton } from '@/components/CopyButton';
import { getOrgBySlug } from '@/lib/org-data';
import { hasOrgRole, membershipFor, type OrgRole } from '@/lib/auth';
import { listPeople, listPendingInvites } from '@/lib/people-data';
import { inviteToOrg, revokeInvitation } from '@/lib/actions/people';

export const metadata: Metadata = { title: 'People' };

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  league_manager: 'League manager',
  coach: 'Coach',
  member: 'Member',
};

const ROLE_MEANS: Record<OrgRole, string> = {
  owner: 'Everything, including billing and handing the league to someone else.',
  admin: 'Everything except giving away ownership. Can invite people and set up payments.',
  league_manager: 'Runs seasons, teams, schedules and registrations. Cannot invite people or touch money.',
  coach: 'Sees and manages their own teams.',
  member: 'A parent or player. Sees their own household.',
};

export default async function PeoplePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const me = await membershipFor(slug);
  const canInvite = await hasOrgRole(slug, 'admin');

  const people = await listPeople(org.id);
  const invites = canInvite ? await listPendingInvites(org.id) : [];

  const h = await headers();
  const base = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;

  const invite = inviteToOrg.bind(null, slug);

  // An admin can create every role below owner; only an owner can make
  // another owner. Offering a role that will be refused on submit is a worse
  // experience than not offering it.
  const assignable: OrgRole[] =
    me?.role === 'owner'
      ? ['league_manager', 'admin', 'owner', 'coach', 'member']
      : ['league_manager', 'admin', 'coach', 'member'];

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '48rem' }}>
      <h1 style={{ fontSize: 'var(--step-3)' }}>People</h1>

      {canInvite && (
        <section style={{ marginTop: '2.5rem' }}>
          <h2>Invite someone</h2>
          <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
            They&rsquo;ll need an account, which they can make when they open
            the link. Invitations last two weeks.
          </p>

          <InviteForm
            action={invite}
            roles={assignable.map((value) => ({
              value,
              label: ROLE_LABEL[value],
              description: ROLE_MEANS[value],
            }))}
          />

          <dl className="ruled" style={{ marginTop: '2rem', borderTop: '1px solid var(--rule)' }}>
            {assignable.map((r) => (
              <div key={r} className="row" style={{ alignItems: 'flex-start' }}>
                <dt style={{ fontWeight: 600, minWidth: '9rem' }}>{ROLE_LABEL[r]}</dt>
                <dd style={{ margin: 0, color: 'var(--ink-soft)' }}>{ROLE_MEANS[r]}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {invites.length > 0 && (
        <section style={{ marginTop: '3rem' }}>
          <h2>Waiting to be accepted</h2>
          <div className="ruled rule-heavy" style={{ marginTop: '1rem' }}>
            {invites.map((inv) => {
              const revoke = revokeInvitation.bind(null, slug, inv.id);
              async function withdraw() {
                'use server';
                await revoke();
              }
              return (
                <div
                  key={inv.id}
                  className="row"
                  style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
                >
                  <span>
                    {inv.email}
                    <br />
                    <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                      {ROLE_LABEL[inv.role]} · expires{' '}
                      {new Intl.DateTimeFormat('en-US', {
                        month: 'short',
                        day: 'numeric',
                        timeZone: org.timezone,
                      }).format(new Date(inv.expiresAt))}
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <CopyButton value={`${base}/invite/${inv.token}`} />
                    <form action={withdraw}>
                      <button
                        type="submit"
                        className="btn btn-quiet"
                        style={{ padding: '0.3rem 0.65rem', fontSize: 'var(--step--1)' }}
                      >
                        Withdraw
                      </button>
                    </form>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section style={{ marginTop: '3rem' }}>
        <h2>In this league</h2>
        <div className="ruled rule-heavy" style={{ marginTop: '1rem' }}>
          {people.map((p) => (
            <div key={p.userId} className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                {p.name}
                {p.email && (
                  <>
                    <br />
                    <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                      {p.email}
                    </span>
                  </>
                )}
              </span>
              <span style={{ color: 'var(--ink-soft)' }}>{ROLE_LABEL[p.role]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
