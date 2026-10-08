import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getOrgBySlug } from '@/lib/org-data';
import { recordCompletion, removeCompletion } from '@/lib/actions/coaches';
import { MarkRequirementDone } from '@/components/MarkRequirementDone';

export const metadata: Metadata = { title: 'Coach' };

/** Months until a completion lapses, or null if it never does. */
function expiresOn(completedOn: string, renewsAfterMonths: number | null): Date | null {
  if (renewsAfterMonths === null) return null;
  const d = new Date(`${completedOn}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + renewsAfterMonths);
  return d;
}

export default async function CoachDetailPage({
  params,
}: {
  params: Promise<{ slug: string; userId: string }>;
}) {
  const { slug, userId } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const supabase = await createClient();

  const { data: person } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle();

  if (!person) notFound();

  const { data: requirements } = await supabase
    .from('coach_requirements')
    .select('id, label, description, renews_after_months')
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .order('sort_order');

  const { data: completions } = await supabase
    .from('coach_requirement_completions')
    .select('id, requirement_id, completed_on')
    .eq('organization_id', org.id)
    .eq('user_id', userId);

  // Latest completion per requirement. A requirement completed three years
  // running has three rows; only the most recent one decides anything.
  const latest = new Map<string, { id: string; completedOn: string }>();
  for (const c of completions ?? []) {
    const held = latest.get(c.requirement_id);
    if (!held || c.completed_on > held.completedOn) {
      latest.set(c.requirement_id, { id: c.id, completedOn: c.completed_on });
    }
  }

  const today = new Date();
  const rows = (requirements ?? []).map((r) => {
    const done = latest.get(r.id);
    const expiry = done ? expiresOn(done.completedOn, r.renews_after_months) : null;
    const lapsed = Boolean(expiry && expiry < today);
    return { ...r, done, expiry, lapsed, satisfied: Boolean(done) && !lapsed };
  });

  const outstanding = rows.filter((r) => !r.satisfied).length;

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '44rem' }}>
      <p style={{ fontSize: 'var(--step--1)' }}>
        <Link href={`/manage/${slug}/coaches`}>Coaches</Link>
      </p>

      <h1 style={{ fontSize: 'var(--step-3)', marginTop: '1rem' }}>
        {person.full_name || person.email || 'Coach'}
      </h1>

      <p style={{ marginTop: '0.75rem', color: outstanding ? 'var(--ink-soft)' : 'var(--win)' }}>
        {outstanding === 0
          ? 'Cleared. Can be assigned to a team.'
          : `${outstanding} outstanding — can't be assigned to a youth team yet.`}
      </p>

      {rows.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)', marginTop: '2rem' }}>
          This league hasn&rsquo;t set any coach requirements, so everyone
          counts as cleared. Add them in settings if you check anything.
        </p>
      ) : (
        <div className="ruled rule-heavy" style={{ marginTop: '2rem' }}>
          {rows.map((r) => {
            const mark = recordCompletion.bind(null, slug, userId, r.id);
            const undoId = r.done?.id;
            async function undo() {
              'use server';
              if (undoId) await removeCompletion(slug, undoId);
            }

            return (
              <div key={r.id} className="row" style={{ alignItems: 'flex-start' }}>
                <span style={{ flex: 1 }}>
                  <strong>{r.label}</strong>
                  {r.description && (
                    <>
                      <br />
                      <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-soft)' }}>
                        {r.description}
                      </span>
                    </>
                  )}
                  <br />
                  <span
                    style={{
                      fontSize: 'var(--step--1)',
                      color: r.satisfied ? 'var(--win)' : r.lapsed ? 'var(--loss)' : 'var(--ink-faint)',
                    }}
                  >
                    {!r.done
                      ? 'Not recorded'
                      : r.lapsed
                        ? `Lapsed ${fmt(r.expiry!, org.timezone)}`
                        : r.expiry
                          ? `Good until ${fmt(r.expiry, org.timezone)}`
                          : `Recorded ${r.done.completedOn}`}
                  </span>
                </span>

                <span>
                  {r.satisfied ? (
                    <form action={undo}>
                      <button
                        type="submit"
                        className="btn btn-quiet"
                        style={{ padding: '0.3rem 0.65rem', fontSize: 'var(--step--1)' }}
                      >
                        Undo
                      </button>
                    </form>
                  ) : (
                    <MarkRequirementDone action={mark} />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="field-hint" style={{ marginTop: '2rem' }}>
        Recording something here means your league confirmed it was done —
        with whichever background check provider or training you already use.
        SportsConnect doesn&rsquo;t run the checks.
      </p>
    </div>
  );
}

function fmt(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: tz,
  }).format(d);
}
