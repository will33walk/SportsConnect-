// Per-tenant branding.
//
// A league sets two colours and a logo at signup and their pages come out
// looking like theirs. That's the whole feature, and the narrowness is the
// point: the big platforms sell white-labelling as an upgrade tier, while a
// volunteer board does not want and should not be handed a design system.
// Two knobs is enough to stop the product feeling like someone else's.
//
// The colours arrive as CSS custom properties on the league's layout wrapper,
// which is why globals.css reads --tenant-brand with a fallback instead of
// hardcoding one. A wrapper rather than <html> because the root layout owns
// that element and a league's pages are nested inside it -- custom properties
// cascade, so a div scopes the theme to exactly the pages that belong to the
// league and leaves the product's own chrome alone.

export interface TenantBranding {
  logoUrl: string | null;
  brandPrimary: string | null;
  brandAccent: string | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Relative luminance, WCAG 2.x. Used to decide whether text on the brand
 * colour should be white or ink -- a league that picks bright yellow should
 * not get white text on it and an unreadable button.
 */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function contrastingInk(hex: string): string {
  // 0.45 rather than the usual 0.5: our ink is a dark navy, not pure black,
  // so it stops winning slightly earlier than a naive midpoint would suggest.
  return luminance(hex) > 0.45 ? '#15233C' : '#FFFFFF';
}

/**
 * CSS custom properties for a tenant, ready to spread onto <html style={...}>.
 * Invalid or missing values are dropped rather than corrected, so the product
 * default shows through -- a malformed colour in the database should look like
 * an unbranded league, not a broken one.
 */
export function themeVars(branding: TenantBranding | null): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!branding) return vars;

  if (branding.brandPrimary && HEX.test(branding.brandPrimary)) {
    vars['--tenant-brand'] = branding.brandPrimary;
    vars['--tenant-brand-ink'] = contrastingInk(branding.brandPrimary);
  }
  if (branding.brandAccent && HEX.test(branding.brandAccent)) {
    vars['--tenant-accent'] = branding.brandAccent;
  }
  return vars;
}
