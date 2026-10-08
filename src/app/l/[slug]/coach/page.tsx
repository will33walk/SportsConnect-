import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getOrgBySlug } from '@/lib/org-data';
import { currentUserId } from '@/lib/auth';
import { applyToCoach } from '@/lib/actions/coaches';
import { CoachApplicationForm } from '@/components/CoachApplicationForm';

export const metadata: Metadata = { title: 'Coach with us' };

export default async function CoachApplyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const userId = await currentUserId();

  if (!userId) {
    return (
      <Wrapper name={org.name}>
        <p style={{ color: 'var(--ink-soft)' }}>
          You&rsquo;ll need an account first — it&rsquo;s how we keep your
          paperwork straight from one season to the next.
        </p>
        <Link
          className="btn"
          href={`/signup?next=${encodeURIComponent(`/l/${slug}/coach`)}`}
          style={{ display: 'inline-block', marginTop: '1.5rem' }}
        >
          Create an account
        </Link>
      </Wrapper>
    );
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('coach_applications')
    .select('status, created_at')
    .eq('organization_id', org.id)
    .eq('user_id', userId)
    .maybeSingle();

  // The league's requirements, shown up front. Someone volunteering should
  // know what they're agreeing to before they fill in a box, not discover a
  // background check three weeks later.
  const { data: requirements } = await supabase
    .from('coach_requirements')
    .select('id, label, description')
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .order('sort_order');

  if (existing && existing.status !== 'withdrawn') {
    return (
      <Wrapper name={org.name}>
        <ApplicationStatus status={existing.status} orgName={org.name} />
      </Wrapper>
    );
  }

  const apply = applyToCoach.bind(null, slug);

  return (
    <Wrapper name={org.name}>
      <p style={{ color: 'var(--ink-soft)' }}>
        Tell us a bit about yourself. Someone from {org.name} will follow up.
      </p>

      {requirements && requirements.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: 'var(--step-1)' }}>What&rsquo;s required</h2>
          <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
            Before you can be put on a team, {org.name} needs each of these
            done. Applying starts that process.
          </p>
          <ul className="ruled" style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
            {requirements.map((r) => (
              <li key={r.id} className="row">
                <span>
                  <strong>{r.label}</strong>
                  {r.description && (
                    <>
                      <br />
                      <span style={{ color: 'var(--ink-soft)', fontSize: 'var(--step--1)' }}>
                        {r.description}
                      </span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CoachApplicationForm action={apply} />
    </Wrapper>
  );
}

function Wrapper({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '38rem' }}>
      <h1 style={{ fontSize: 'var(--step-3)' }}>Coach with {name}</h1>
      <div style={{ marginTop: '1rem' }}>{children}</div>
    </div>
  );
}

function ApplicationStatus({ status, orgName }: { status: string; orgName: string }) {
  if (status === 'approved') {
    return (
      <p>
        You&rsquo;re approved to coach with {orgName}. Once your requirements
        are all recorded, you can be put on a team.
      </p>
    );
  }
  if (status === 'declined') {
    // No reason given. The league's internal note about a volunteer is not a
    // letter to that volunteer, and a vague rejection they can follow up on
    // in person is kinder than a blunt one in a web page.
    return (
      <p>
        {orgName} isn&rsquo;t able to take you on as a coach this season. Get
        in touch with them directly if you&rsquo;d like to talk it through.
      </p>
    );
  }
  return (
    <p>
      Your application is in. Someone from {orgName} will be in touch — there
      is nothing else for you to do right now.
    </p>
  );
}
