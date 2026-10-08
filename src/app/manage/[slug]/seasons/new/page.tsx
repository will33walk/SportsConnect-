import Link from 'next/link';
import type { Metadata } from 'next';
import { NewSeasonForm } from '@/components/NewSeasonForm';
import { createSeason } from '@/lib/actions/seasons';
import { listSports } from '@/lib/season-data';

export const metadata: Metadata = { title: 'New season' };

export default async function NewSeasonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sports = await listSports();
  const create = createSeason.bind(null, slug);

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '36rem' }}>
      <p style={{ fontSize: 'var(--step--1)' }}>
        <Link href={`/manage/${slug}/seasons`}>Seasons</Link>
      </p>

      <h1 style={{ fontSize: 'var(--step-3)', marginTop: '1rem' }}>New season</h1>

      <NewSeasonForm action={create} sports={sports} />
    </div>
  );
}
