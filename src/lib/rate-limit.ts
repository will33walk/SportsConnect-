import { adminFetch } from '@/lib/supabase/admin-fetch';

// IP/key-based rate limiting backed by a Supabase table rather than an
// in-memory counter, since serverless instances don't share memory. Not
// built for high concurrency -- a small parks department's public-form
// traffic doesn't need anything fancier than "count rows in the last N
// minutes," and a race under real load just means someone's cap is off by
// one or two, not a security hole.
//
// Fails OPEN (allows the request) on any error, including "the
// request_rate_limits table doesn't exist yet" -- this guards a
// nice-to-have against spam, it should never be the reason the public
// rental form or the email-intake webhook goes down.
export async function checkRateLimit(
  bucketKey: string,
  opts: { max: number; windowMinutes: number }
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - opts.windowMinutes * 60_000).toISOString();
    const res = await adminFetch(
      `/rest/v1/request_rate_limits?bucket_key=eq.${encodeURIComponent(bucketKey)}&created_at=gte.${encodeURIComponent(since)}&select=id`
    );
    if (!res.ok) throw new Error(`rate limit check failed: ${res.status}`);
    const rows: unknown[] = await res.json();
    if (rows.length >= opts.max) return false;

    await adminFetch('/rest/v1/request_rate_limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket_key: bucketKey }),
    });

    // Best-effort cleanup so the table doesn't grow unbounded -- cheap
    // enough to run inline given how little traffic this guards.
    if (Math.random() < 0.05) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      await adminFetch(`/rest/v1/request_rate_limits?created_at=lt.${encodeURIComponent(cutoff)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }

    return true;
  } catch (err) {
    console.warn('[rate-limit] check failed, allowing request through:', err);
    return true;
  }
}
