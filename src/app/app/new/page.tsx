import Link from 'next/link';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { NewOrgForm } from '@/components/NewOrgForm';
import { createOrganization } from '@/lib/actions/organizations';

export const metadata: Metadata = { title: 'Start a league · SportsConnect' };

// Vercel sends the requester's timezone, which is a better first guess than a
// dropdown of 400 zones. The field stays editable: a league director setting
// this up on holiday shouldn't end up with their season in the wrong zone.
async function guessTimezone(): Promise<string> {
  const h = await headers();
  return h.get('x-vercel-ip-timezone') || 'America/New_York';
}

export default async function NewOrgPage() {
  const timezone = await guessTimezone();

  return (
    <div className="shell" style={{ maxWidth: '34rem', paddingBlock: 'clamp(2.5rem, 8vh, 5rem)' }}>
      <p style={{ fontSize: 'var(--step--1)' }}>
        <Link href="/app">Your leagues</Link>
      </p>

      <h1 style={{ fontSize: 'var(--step-3)', marginTop: '1rem' }}>Start a league</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: '0.75rem' }}>
        This creates the organization that holds your seasons, teams and
        registrations. You can change any of it later.
      </p>

      <NewOrgForm action={createOrganization} defaultTimezone={timezone} />
    </div>
  );
}
