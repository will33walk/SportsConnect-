import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getOrgBilling, getOrgBySlug } from '@/lib/org-data';
import { hasOrgRole } from '@/lib/auth';
import { connectStatus, stripeConfigured } from '@/lib/stripe';
import { openStripeDashboard, startStripeOnboarding } from '@/lib/actions/payments';

export const metadata: Metadata = { title: 'Payments' };

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  // Visible to a league manager, actionable only by an admin. Where the
  // money lands is not a thing to hide from the people running the season,
  // but it is a thing only an owner or admin should be able to change.
  const canChange = await hasOrgRole(slug, 'admin');
  const billing = await getOrgBilling(org.id);
  const status = billing?.stripeAccountId
    ? await connectStatus(billing.stripeAccountId)
    : null;

  // Thin wrappers so these are `(formData) => Promise<void>`, which is what a
  // <form action> takes. The underlying actions return an ActionResult, and
  // on success they redirect, so there is nothing for the form to render.
  async function connect() {
    'use server';
    await startStripeOnboarding(slug);
  }

  async function dashboard() {
    'use server';
    await openStripeDashboard(slug);
  }

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '44rem' }}>
      <h1 style={{ fontSize: 'var(--step-3)' }}>Payments</h1>

      {!stripeConfigured() ? (
        <p style={{ color: 'var(--ink-soft)', marginTop: '1rem' }}>
          Payments aren&rsquo;t available on this deployment yet.
        </p>
      ) : status?.chargesEnabled ? (
        <Connected
          payoutsEnabled={status.payoutsEnabled}
          canChange={canChange}
          dashboard={dashboard}
        />
      ) : status ? (
        <Unfinished
          outstanding={status.requirementsDue.length}
          canChange={canChange}
          connect={connect}
        />
      ) : (
        <NotStarted canChange={canChange} connect={connect} />
      )}
    </div>
  );
}

function NotStarted({
  canChange,
  connect,
}: {
  canChange: boolean;
  connect: () => Promise<void>;
}) {
  return (
    <>
      <p style={{ color: 'var(--ink-soft)', marginTop: '1rem' }}>
        Registration fees go straight to your league&rsquo;s own Stripe account
        and pay out on your schedule. We never hold your money, and we take no
        percentage of it.
      </p>
      <p style={{ color: 'var(--ink-soft)' }}>
        Stripe charges its own card processing fee, which comes out of each
        payment. Setting this up takes a few minutes and needs your
        league&rsquo;s bank details.
      </p>
      {canChange ? (
        <form action={connect}>
          <button className="btn" type="submit" style={{ marginTop: '1.5rem' }}>
            Connect Stripe
          </button>
        </form>
      ) : (
        <AdminOnly />
      )}
    </>
  );
}

function Unfinished({
  outstanding,
  canChange,
  connect,
}: {
  outstanding: number;
  canChange: boolean;
  connect: () => Promise<void>;
}) {
  return (
    <>
      <p style={{ marginTop: '1rem' }}>
        Stripe still needs {outstanding > 0 ? `${outstanding} more ` : 'a few more '}
        {outstanding === 1 ? 'detail' : 'details'} before your league can take
        registration payments.
      </p>
      {canChange ? (
        <form action={connect}>
          <button className="btn" type="submit" style={{ marginTop: '1.5rem' }}>
            Finish setup on Stripe
          </button>
        </form>
      ) : (
        <AdminOnly />
      )}
    </>
  );
}

function Connected({
  payoutsEnabled,
  canChange,
  dashboard,
}: {
  payoutsEnabled: boolean;
  canChange: boolean;
  dashboard: () => Promise<void>;
}) {
  return (
    <>
      <p style={{ marginTop: '1rem' }}>
        Your league can take registration payments.
        {!payoutsEnabled &&
          ' Payouts to your bank are still being verified by Stripe — money is collecting safely in the meantime.'}
      </p>
      {canChange && (
        <form action={dashboard}>
          <button className="btn btn-quiet" type="submit" style={{ marginTop: '1.5rem' }}>
            Open your Stripe dashboard
          </button>
        </form>
      )}
    </>
  );
}

function AdminOnly() {
  return (
    <p style={{ color: 'var(--ink-faint)', marginTop: '1.5rem' }}>
      An owner or admin of this league sets up payments.
    </p>
  );
}
