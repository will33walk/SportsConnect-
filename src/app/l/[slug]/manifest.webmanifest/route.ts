import { NextResponse } from 'next/server';
import { getOrgBySlug } from '@/lib/org-data';

// A manifest per league, so installing from a league's page puts THAT league
// on the home screen -- their name under the icon, their colour behind it,
// opening to their schedule. One shared manifest would put our name on every
// parent's phone, which defeats the point.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);

  if (!org) return new NextResponse('Not found', { status: 404 });

  return NextResponse.json(
    {
      name: org.name,
      short_name: org.name.length > 12 ? org.name.slice(0, 12).trim() : org.name,
      description: `Schedule, rosters, scores and stats for ${org.name}.`,
      start_url: `/l/${org.slug}`,
      scope: `/l/${org.slug}`,
      display: 'standalone',
      background_color: '#F1F3F0',
      // The board, not the league's brand colour: this tints the status bar
      // and system chrome, and a league that picks a pale colour would get
      // unreadable white status text over it.
      theme_color: '#11180F',
      icons: org.logoUrl
        ? [{ src: org.logoUrl, sizes: '512x512', type: 'image/png', purpose: 'any' }]
        : [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json',
        // Public and stable. A league changing its logo takes up to an hour
        // to reach already-installed phones, which is the right trade against
        // regenerating this on every app launch.
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    },
  );
}
