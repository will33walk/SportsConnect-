import type { MetadataRoute } from 'next';

// Every league is installable. A parent adds their league to their home screen
// and gets an icon, a full-screen app and push notifications without an app
// store, a download, or anything for us to maintain in two native codebases.
//
// This is the product-level manifest. Per-league manifests are generated at
// /l/[slug]/manifest.webmanifest so the installed icon and name are the
// league's own, not ours -- the whole point is that it feels like their app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SportsConnect',
    short_name: 'SportsConnect',
    description: 'Rosters, schedules, live scores and stats for youth leagues.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F1F3F0',
    theme_color: '#11180F',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
