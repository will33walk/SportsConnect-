import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { OrgShell } from '@/components/OrgShell';
import { getOrgBySlug } from '@/lib/org-data';
import { hasOrgRole } from '@/lib/auth';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  return { title: org ? { default: `Manage ${org.name}`, template: `%s · ${org.name}` } : 'Not found' };
}

export default async function ManageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  // notFound rather than a 403. Someone who isn't in this league should not
  // learn that it exists from the difference between the two responses.
  if (!(await hasOrgRole(slug, 'league_manager'))) notFound();

  return (
    <OrgShell
      org={org}
      home={`/manage/${slug}`}
      // Seasons and People aren't built yet, so they aren't here. A nav item
      // that 404s is worse than one that's missing.
      nav={[
        { href: `/manage/${slug}/payments`, label: 'Payments' },
        { href: `/manage/${slug}/settings`, label: 'Settings' },
        { href: `/l/${slug}`, label: 'View public page' },
      ]}
    >
      {children}
    </OrgShell>
  );
}
