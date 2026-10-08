import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refreshes the Supabase session cookie on every request, and keeps signed-out
// visitors out of the parts of the product that need an account.
//
// The protected set is a short DENY list rather than an allowlist, because
// most of this product is deliberately public: a league's schedule, its
// rosters once published, standings, and the live game view all have to work
// for a grandparent with a link and no account. Only the places where someone
// manages something need a session.
//
// This is a redirect, not an authorization check. Nothing here decides what a
// signed-in person may see -- RLS does, on every query.
const PROTECTED_PREFIXES = [
  '/app',       // org picker, account, creating a league
  '/manage',    // league administration
  '/coach',     // coach tools: lineups, draft board, scorekeeping
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    // Come back here after signing in. Only a path is kept, never a full URL
    // from the query string -- that would be an open redirect.
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (user && (path === '/signin' || path === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/app';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
