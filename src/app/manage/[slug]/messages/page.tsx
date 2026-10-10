import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getOrgBySlug } from '@/lib/org-data';
import { BlastComposer, type BlastSeason, type BlastTeam } from '@/components/BlastComposer';
import { previewAudience, sendAnnouncement, type BlastScope } from '@/lib/actions/announcements';

export const metadata: Metadata = { title: 'Messages' };

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const supabase = await createClient();

  const { data: programs } = await supabase
    .from('programs')
    .select('id, title, parent_program_id, status')
    .eq('organization_id', org.id)
    .eq('kind', 'league')
    .not('status', 'in', '("archived","cancelled")')
    .order('title');

  const all = programs ?? [];
  const titleById = new Map(all.map((p) => [p.id, p.title]));
  const hasChildren = new Set(all.filter((p) => p.parent_program_id).map((p) => p.parent_program_id!));

  // Parents first, then their divisions. A league director thinking "tell
  // everyone" should find that at the top.
  const seasons: BlastSeason[] = [
    ...all
      .filter((p) => !p.parent_program_id)
      .map((p) => ({
        id: p.id,
        title: p.title,
        parentTitle: null,
        isParent: hasChildren.has(p.id),
      })),
    ...all
      .filter((p) => p.parent_program_id)
      .map((p) => ({
        id: p.id,
        title: p.title,
        parentTitle: titleById.get(p.parent_program_id!) ?? null,
        isParent: false,
      })),
  ];

  const { data: teamRows } = await supabase
    .from('teams')
    .select('id, name, league_id')
    .eq('organization_id', org.id)
    .order('name');

  const teams: BlastTeam[] = (teamRows ?? []).map((t) => {
    const season = all.find((p) => p.id === t.league_id);
    const seasonTitle = season
      ? season.parent_program_id
        ? `${titleById.get(season.parent_program_id) ?? ''} — ${season.title}`
        : season.title
      : 'Other';
    return { id: t.id, name: t.name, seasonTitle };
  });

  const { data: sent } = await supabase
    .from('announcements')
    .select('id, subject, scope, program_id, recipient_count, created_at')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(25);

  const send = sendAnnouncement.bind(null, slug);
  async function preview(scope: BlastScope, programId: string | null, teamIds: string[]) {
    'use server';
    return previewAudience(slug, scope, programId, teamIds);
  }

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '42rem' }}>
      <h1 style={{ fontSize: 'var(--step-3)' }}>Messages</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: '0.75rem' }}>
        Goes to the adults — parents, guardians and coaches — not to players.
        They see it in the app, and on their phone if they&rsquo;ve added your
        league to their home screen.
      </p>

      <div style={{ marginTop: '2rem' }}>
        <BlastComposer
          send={send}
          preview={preview}
          seasons={seasons}
          teams={teams}
          orgName={org.name}
        />
      </div>

      {(sent ?? []).length > 0 && (
        <section style={{ marginTop: '3.5rem' }}>
          <h2>Sent</h2>
          <div className="ruled rule-heavy" style={{ marginTop: '1rem' }}>
            {sent!.map((a) => (
              <div key={a.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  <strong>{a.subject}</strong>
                  <br />
                  <span style={{ fontSize: 'var(--step--1)', color: 'var(--ink-faint)' }}>
                    {a.scope === 'organization'
                      ? 'Everyone'
                      : a.scope === 'program'
                        ? (titleById.get(a.program_id ?? '') ?? 'A season')
                        : 'Picked teams'}
                    {' · '}
                    {new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: org.timezone,
                    }).format(new Date(a.created_at))}
                  </span>
                </span>
                <span style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                  {a.recipient_count} {a.recipient_count === 1 ? 'person' : 'people'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
