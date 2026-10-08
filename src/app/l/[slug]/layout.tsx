import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { OrgShell } from '@/components/OrgShell';
import { getOrgBySlug } from '@/lib/org-data';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) return { title: 'Not found' };

  return {
    title: { default: org.name, template: `%s · ${org.name}` },
    // Each league is its own installable app, so each gets its own manifest.
    // Installed from a league's page, the icon and name on the home screen
    // are theirs -- which is the whole reason this is a PWA and not one
    // app-store download with a league picker inside it.
    manifest: `/l/${slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: org.name },
  };
}

// The public face of a league: schedule, teams, standings, live games. No
// account required for any of it. A grandparent with a link is the person
// this layout is for.
export default async function LeagueLayout({ children, params }: LayoutProps) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  return (
    <OrgShell
      org={org}
      home={`/l/${slug}`}
      // Schedule, Teams and Standings go here once those pages exist. The
      // league home currently carries what little there is to show.
      nav={[]}
    >
      {children}
    </OrgShell>
  );
}
