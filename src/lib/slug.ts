// Slug rules for a league's web address: /l/<slug>.
//
// Pure and synchronous, and deliberately in its own module rather than the
// actions file -- every export from a 'use server' file is treated as a
// Server Action and must be async, so a helper living there could not be
// called from the signup form to preview the address as someone types.

const RESERVED = new Set([
  'app', 'api', 'signin', 'signup', 'admin', 'manage', 'coach', 'l',
  'about', 'pricing', 'help', 'support', 'legal', 'privacy', 'terms',
  'static', 'assets', 'public', 'demo', 'new', 'settings', 'billing',
]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    // Strip combining marks left by the decomposition, so "Peñasco" becomes
    // "penasco" rather than "penasco" with a stray tilde codepoint.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    // Slicing can leave a trailing hyphen, which the schema's check rejects.
    .replace(/-$/, '');
}

/** Null when valid; otherwise a message to show the person. */
export function validateSlug(slug: string): string | null {
  if (slug.length < 3) return 'Use at least 3 characters.';
  if (slug.length > 40) return 'Keep it under 40 characters.';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])$/.test(slug)) {
    return 'Use letters, numbers and hyphens, starting and ending with a letter or number.';
  }
  if (RESERVED.has(slug)) return 'That address is taken.';
  return null;
}
