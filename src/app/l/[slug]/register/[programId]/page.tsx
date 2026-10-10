import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getOrgBySlug } from '@/lib/org-data';
import { currentUserId } from '@/lib/auth';
import { RegistrationForm } from '@/components/RegistrationForm';
import { checkPromoCode, register } from '@/lib/actions/registration';
import {
  getProgramForRegistration,
  listAvailableTiers,
  listQuestions,
  myDependents,
  registrationClosedReason,
  siblingsAlreadyIn,
  spotsRemaining,
} from '@/lib/registration-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; programId: string }>;
}): Promise<Metadata> {
  const { slug, programId } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) return { title: 'Not found' };
  const program = await getProgramForRegistration(org.id, programId);
  return { title: program ? `Register — ${program.title}` : 'Register' };
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ slug: string; programId: string }>;
}) {
  const { slug, programId } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const program = await getProgramForRegistration(org.id, programId);
  if (!program) notFound();

  const left = await spotsRemaining(programId, program.capacity);
  const closed = registrationClosedReason(program, left, new Date());
  const tiers = await listAvailableTiers(programId);
  const questions = await listQuestions(programId);
  const userId = await currentUserId();

  // Signed-out visitors see the price and what's being offered, then sign in.
  // Putting the wall before the price is the thing this product is against.
  if (!userId) {
    return (
      <Shell program={program} org={org.name} left={left}>
        {closed ? (
          <p style={{ color: 'var(--ink-soft)' }}>{closed}</p>
        ) : (
          <>
            {tiers.length > 0 && (
              <div className="ruled rule-heavy" style={{ marginTop: '1.5rem' }}>
                {tiers.map((t) => (
                  <div key={t.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{t.label}</span>
                    <span style={{ fontWeight: 600 }}>${(t.amountCents / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            <p style={{ color: 'var(--ink-soft)', marginTop: '1.5rem' }}>
              Sign in to register. One account covers every child and every
              season.
            </p>
            <Link
              className="btn"
              href={`/signup?next=${encodeURIComponent(`/l/${slug}/register/${programId}`)}`}
              style={{ display: 'inline-block', marginTop: '0.5rem' }}
            >
              Continue
            </Link>
          </>
        )}
      </Shell>
    );
  }

  if (closed) {
    return (
      <Shell program={program} org={org.name} left={left}>
        <p style={{ color: 'var(--ink-soft)' }}>{closed}</p>
      </Shell>
    );
  }

  if (tiers.length === 0) {
    return (
      <Shell program={program} org={org.name} left={left}>
        <p style={{ color: 'var(--ink-soft)' }}>
          {org.name} hasn&rsquo;t set prices for this season yet. Check back
          shortly.
        </p>
      </Shell>
    );
  }

  const dependents = program.involvesMinors ? await myDependents(org.id, userId) : [];
  const alreadyIn = await siblingsAlreadyIn(programId, org.id, userId);
  const full = left !== null && left <= 0;

  const submit = register.bind(null, slug, programId);
  async function promo(code: string) {
    'use server';
    return checkPromoCode(slug, programId, code);
  }

  return (
    <Shell program={program} org={org.name} left={left}>
      {full && (
        <p style={{ marginBottom: '1.5rem' }}>
          This season is full. Add your player to the waitlist and {org.name}{' '}
          will be in touch if a spot opens — you won&rsquo;t be charged now.
        </p>
      )}

      {alreadyIn > 0 && program.sibling?.enabled && (
        <p style={{ color: 'var(--win)', marginBottom: '1.5rem' }}>
          You already have {alreadyIn === 1 ? 'a player' : `${alreadyIn} players`} in
          this season, so the family discount is applied below.
        </p>
      )}

      <RegistrationForm
        action={submit}
        checkPromo={promo}
        tiers={tiers}
        questions={questions}
        dependents={dependents}
        involvesMinors={program.involvesMinors}
        sibling={program.sibling}
        siblingsAlreadyIn={alreadyIn}
        feePolicy={program.feePolicy}
        waitlist={full}
      />
    </Shell>
  );
}

function Shell({
  program,
  org,
  left,
  children,
}: {
  program: { title: string; description: string | null; startsOn: string | null; endsOn: string | null };
  org: string;
  left: number | null;
  children: React.ReactNode;
}) {
  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '36rem' }}>
      <h1 style={{ fontSize: 'var(--step-3)' }}>{program.title}</h1>

      <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
        {org}
        {program.startsOn && ` · starts ${friendly(program.startsOn)}`}
      </p>

      {program.description && (
        <p style={{ marginTop: '1rem' }}>{program.description}</p>
      )}

      {/* Only shown when it's genuinely nearly gone. A permanent "12 spots
          left" counter is a pressure tactic, not information. */}
      {left !== null && left > 0 && left <= 10 && (
        <p style={{ color: 'var(--ink-soft)', marginTop: '1rem' }}>
          {left} {left === 1 ? 'spot' : 'spots'} left.
        </p>
      )}

      <div style={{ marginTop: '2rem' }}>{children}</div>
    </div>
  );
}

function friendly(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}
