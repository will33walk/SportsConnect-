import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getOrgBySlug } from '@/lib/org-data';
import { listCoaches } from '@/lib/people-data';
import { AssignCoach } from '@/components/AssignCoach';
import { AddRosterName } from '@/components/AddRosterName';
import { InviteTeammate } from '@/components/InviteTeammate';
import { assignCoach, removeCoach, addRosterName, invitePlayer } from '@/lib/actions/teams';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const supabase = await createClient();

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, color, league_id')
    .eq('id', teamId)
    .maybeSingle();

  if (!team) notFound();

  const { data: league } = await supabase
    .from('leagues')
    .select('id, roster_model')
    .eq('id', team.league_id)
    .maybeSingle();

  const { data: program } = await supabase
    .from('programs')
    .select('title, involves_minors')
    .eq('id', team.league_id)
    .maybeSingle();

  const { data: roster } = await supabase
    .from('team_members')
    .select('id, display_name, user_id, registration_id, jersey_number')
    .eq('team_id', teamId);

  const { data: staff } = await supabase
    .from('team_coaches')
    .select('id, user_id, role')
    .eq('team_id', teamId);

  // Names for whoever is on the roster or the bench by account rather than by
  // written-in name.
  const userIds = [
    ...(roster ?? []).map((r) => r.user_id).filter((v): v is string => Boolean(v)),
    ...(staff ?? []).map((s) => s.user_id),
  ];
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || 'Someone']));

  // Who could be put on this team: approved applicants. Cleared ones can be
  // assigned; the rest are shown with what's outstanding rather than hidden,
  // because "why isn't Dave in the list" is the question that generates a
  // phone call.
  const coaches = (await listCoaches(org.id)).filter((c) => c.status === 'approved');
  const onTeam = new Set((staff ?? []).map((s) => s.user_id));
  const available = coaches.filter((c) => !onTeam.has(c.userId));

  const youth = program?.involves_minors ?? true;
  const model = league?.roster_model ?? 'assigned';

  const assign = assignCoach.bind(null, slug, teamId);
  const addName = addRosterName.bind(null, slug, teamId);
  const invite = invitePlayer.bind(null, slug, teamId);

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '44rem' }}>
      <p style={{ fontSize: 'var(--step--1)' }}>
        <Link href={`/manage/${slug}/seasons/${team.league_id}`}>
          {program?.title ?? 'Season'}
        </Link>
      </p>

      <h1 style={{ fontSize: 'var(--step-3)', marginTop: '1rem' }}>{team.name}</h1>

      {/* Coaches */}
      <section style={{ marginTop: '2.5rem' }}>
        <h2>{model === 'team_registration' ? 'Captain and coaches' : 'Coaches'}</h2>

        {(staff ?? []).length > 0 && (
          <div className="ruled rule-heavy" style={{ marginTop: '1rem' }}>
            {staff!.map((s) => {
              async function drop() {
                'use server';
                await removeCoach(slug, s.id);
              }
              return (
                <div key={s.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    {nameOf.get(s.user_id) ?? 'Someone'}
                    <br />
                    <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                      {s.role === 'head' ? 'Head coach' : s.role === 'captain' ? 'Captain' : 'Assistant'}
                    </span>
                  </span>
                  <form action={drop}>
                    <button
                      type="submit"
                      className="btn btn-quiet"
                      style={{ padding: '0.3rem 0.65rem', fontSize: 'var(--step--1)' }}
                    >
                      Remove
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: '1.5rem' }}>
          <AssignCoach
            action={assign}
            candidates={available.map((c) => ({
              userId: c.userId,
              name: c.name,
              cleared: c.cleared,
              missingCount: c.missingCount,
            }))}
            youth={youth}
            manageHref={`/manage/${slug}/coaches`}
          />
        </div>
      </section>

      {/* Roster */}
      <section style={{ marginTop: '3rem' }}>
        <h2>Roster</h2>

        {(roster ?? []).length === 0 ? (
          <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
            {model === 'draft'
              ? 'Players arrive here from the draft.'
              : model === 'assigned'
                ? 'Players arrive here when you place them from the registration list.'
                : 'Nobody yet — invite your players below.'}
          </p>
        ) : (
          <div className="ruled rule-heavy" style={{ marginTop: '1rem' }}>
            {roster!.map((r) => (
              <div key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>{r.display_name ?? nameOf.get(r.user_id ?? '') ?? 'Registered player'}</span>
                {r.jersey_number && (
                  <span style={{ color: 'var(--ink-faint)', fontWeight: 700, fontStretch: '125%' }}>
                    {r.jersey_number}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {model === 'team_registration' && (
          <div style={{ marginTop: '2rem', display: 'grid', gap: '2rem' }}>
            <div>
              <h3 style={{ fontSize: 'var(--step-0)' }}>Invite a player</h3>
              <p className="field-hint" style={{ marginBottom: '0.5rem' }}>
                They get their own sign-in and can see the schedule.
              </p>
              <InviteTeammate action={invite} />
            </div>

            <div>
              <h3 style={{ fontSize: 'var(--step-0)' }}>Or just write them down</h3>
              <p className="field-hint" style={{ marginBottom: '0.5rem' }}>
                For the teammate who doesn&rsquo;t do email. They&rsquo;ll be on
                the roster and in the scorebook.
              </p>
              <AddRosterName action={addName} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
