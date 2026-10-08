import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import './globals.css';

// One family, two widths. Sports lettering is wide and heavy -- jersey
// wordmarks, scoreboard panels -- so the width axis carries the display
// register and a second typeface would be one too many.
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SportsConnect',
  description:
    'League software for the leagues that got priced out. Rosters, schedules, live scores and stats, one flat price.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F1F3F0' },
    { media: '(prefers-color-scheme: dark)', color: '#121A14' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
