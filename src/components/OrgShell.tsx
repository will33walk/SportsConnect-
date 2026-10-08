import Link from 'next/link';
import { themeVars } from '@/lib/theme';
import type { Org } from '@/lib/org-data';

interface Props {
  org: Org;
  /** Where the wordmark links. Public pages go to the league home. */
  home: string;
  nav: { href: string; label: string }[];
  children: React.ReactNode;
}

/**
 * The frame every league page sits in, carrying that league's colours.
 *
 * The theme is applied here rather than at the document root so it scopes to
 * the league's own pages: a parent in two leagues sees each one's colours on
 * its own pages, and the product's own chrome stays the product's.
 */
export function OrgShell({ org, home, nav, children }: Props) {
  // Custom properties aren't among CSSProperties' known keys, so the cast is
  // unavoidable; the values themselves are validated in themeVars().
  const theme = themeVars(org) as unknown as React.CSSProperties;

  return (
    <div style={theme}>
      <header style={{ borderBottom: '1px solid var(--rule)' }}>
        <div
          className="shell"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1.5rem',
            flexWrap: 'wrap',
            paddingBlock: '1rem',
          }}
        >
          <Link
            href={home}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              textDecoration: 'none',
              fontWeight: 700,
              fontStretch: '125%',
              fontSize: 'var(--step-1)',
            }}
          >
            {org.logoUrl && (
              // Not next/image: a league's logo comes from their own Supabase
              // bucket at an unknown size, and this is one small mark in a
              // header, not a page of photographs.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logoUrl}
                alt=""
                width={28}
                height={28}
                style={{ objectFit: 'contain' }}
              />
            )}
            {org.name}
          </Link>

          {nav.length > 0 && (
            <nav>
              <ul
                style={{
                  display: 'flex',
                  gap: '1.25rem',
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  flexWrap: 'wrap',
                }}
              >
                {nav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} style={{ textDecoration: 'none' }}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
