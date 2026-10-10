import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/supabase/admin-fetch';

// Frees spots held by checkouts nobody finished.
//
// A pending registration holds its place for 30 minutes, so a parent hunting
// for their wallet doesn't lose it to someone refreshing. After that the spot
// goes back, which matters most on the night registration opens for a capped
// division -- the exact moment abandoned carts and real demand collide.
//
// Runs on a schedule (vercel.json). Guarded by a secret, failing closed: an
// unguarded endpoint that cancels registrations is not something to leave
// open because an env var is missing.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error('[cron/release-spots] CRON_SECRET is not set');
    return new NextResponse('Not configured', { status: 500 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const res = await adminFetch('/rest/v1/rpc/release_stale_registrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  const released = (await res.json()) as number;
  return NextResponse.json({ released });
}
