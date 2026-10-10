import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { NewSeasonForm } from '@/components/NewSeasonForm';
import { createSeason } from '@/lib/actions/seasons';
import { listSports } from '@/lib/season-data';
import { getActiveSeasonCount, getOrgBySlug, getOrgPlan } from '@/lib/org-data';
import { PLANS, planPrice } from '@/lib/plans';

export const metadata: Metadata = { title: 'New season' };

export default async function NewSeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ parent?: string }>;
}) {
  const { slug } = await params;
  const { parent } = await searchParams;

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const plan = await getOrgPlan(org.id);
  const sports = await listSports();
  const create = createSeason.bind(null, slug);

  // Adding a division. Only on Unlimited, and only under a real league of
  // this org -- the action re-checks both, and the trigger behind it refuses
  // regardless, but there's no point rendering a form that can't succeed.
  let parentSeason: { id: string; title: string } | null = null;
  if (parent) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('programs')
      .select('id, title')
      .eq('id', parent)
      .eq('organization_id', org.id)
      .eq('kind', 'league')
      .is('parent_program_id', null)
      .maybeSingle();
    parentSeason = data ?? null;
  }

  if (parentSeason && plan !== 'unlimited') {
    return (
      <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '36rem' }}>
        <p style={{ fontSize: 'var(--step--1)' }}>
          <Link href={`/manage/${slug}/seasons`}>Seasons</Link>
        </p>
        <h1 style={{ fontSize: 'var(--step-3)', marginTop: '1rem' }}>Divisions</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: '0.75rem' }}>
          Divisions come with {PLANS.unlimited.name} (
          {planPrice(PLANS.unlimited.monthlyCents)}/month). One organization
          runs several age groups under a parent league — T-ball, 8u, 11u and
          14u under {parentSeason.title} — each keeping its own teams, schedule,
          registration and roster rules, with one place to message everybody at
          once.
        </p>
        <Link className="btn" href={`/manage/${slug}/plan`} style={{ display: 'inline-block', marginTop: '1rem' }}>
          See Unlimited
        </Link>
      </div>
    );
  }

  // Not a division, so the one-at-a-time limit applies.
  if (!parentSeason && plan === 'league') {
    const active = await getActiveSeasonCount(org.id);
    if (active >= 1) {
      return (
        <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '36rem' }}>
          <p style={{ fontSize: 'var(--step--1)' }}>
            <Link href={`/manage/${slug}/seasons`}>Seasons</Link>
          </p>
          <h1 style={{ fontSize: 'var(--step-3)', marginTop: '1rem' }}>
            You have a season running
          </h1>
          <p style={{ color: 'var(--ink-soft)', marginTop: '0.75rem' }}>
            The {PLANS.league.name} plan covers one season at a time. Archive
            the current one when it&rsquo;s finished and start the next at no
            extra cost — or move to {PLANS.unlimited.name} (
            {planPrice(PLANS.unlimited.monthlyCents)}/month) to run seasons
            side by side and group divisions under a parent league.
          </p>
          <Link className="btn" href={`/manage/${slug}/plan`} style={{ display: 'inline-block', marginTop: '1rem' }}>
            See Unlimited
          </Link>
        </div>
      );
    }
  }

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '36rem' }}>
      <p style={{ fontSize: 'var(--step--1)' }}>
        <Link href={`/manage/${slug}/seasons`}>Seasons</Link>
      </p>

      <h1 style={{ fontSize: 'var(--step-3)', marginTop: '1rem' }}>
        {parentSeason ? `New division in ${parentSeason.title}` : 'New season'}
      </h1>

      {parentSeason && (
        <p style={{ color: 'var(--ink-soft)', marginTop: '0.75rem' }}>
          It gets its own teams, schedule, registration and roster rules.
          Families with a child in more than one division see them together.
        </p>
      )}

      <NewSeasonForm action={create} sports={sports} parent={parentSeason} />
    </div>
  );
}
