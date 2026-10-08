// Talks to Supabase over plain fetch (REST + Storage APIs) rather than the
// @supabase/supabase-js admin client (src/lib/supabase/admin.ts) -- that
// client's realtime module requires a native WebSocket global, missing
// below Node 20.19, and crashed at construction time when tried directly
// in this environment. Sidesteps the whole question. Bypasses RLS via the
// service role key, so only call this from trusted server-side code that
// has already validated its own caller (a signing token, a webhook secret,
// an authenticated staff session) -- there's no RLS safety net here.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminHeaders = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

export async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...adminHeaders, ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return res;
}

export async function downloadFromStorage(bucket: string, path: string): Promise<Buffer> {
  const res = await adminFetch(`/storage/v1/object/${bucket}/${path}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function uploadToStorage(bucket: string, path: string, bytes: Buffer, contentType: string) {
  await adminFetch(`/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
    body: new Uint8Array(bytes),
  });
}

// One-time upload token for a single object path. The browser uploads the
// file straight to Storage with it (putToSignedUpload in client-media.ts) --
// used where files can exceed Vercel's ~4.5 MB request-body cap. Only issue
// one after checking the caller may write that exact path.
export async function createSignedUploadToken(bucket: string, path: string): Promise<string> {
  const res = await adminFetch(`/storage/v1/object/upload/sign/${bucket}/${path}`, { method: 'POST' });
  const { token } = (await res.json()) as { token: string };
  return token;
}

// Server-side truth about an uploaded object (its real size and type, not
// what the client claimed). Null when it doesn't exist.
export async function getStorageObjectInfo(bucket: string, path: string): Promise<{ size: number; contentType: string } | null> {
  try {
    const res = await adminFetch(`/storage/v1/object/info/${bucket}/${path}`);
    const info = (await res.json()) as { size: number; content_type: string };
    return { size: info.size, contentType: info.content_type };
  } catch {
    return null;
  }
}

// Short-lived download links for private objects, in one call.
export async function createSignedDownloadUrls(bucket: string, paths: string[], expiresInSeconds: number): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const res = await adminFetch(`/storage/v1/object/sign/${bucket}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: expiresInSeconds, paths }),
  });
  const rows = (await res.json()) as { path: string; signedURL: string | null; error: string | null }[];
  return new Map(rows.filter((r) => r.signedURL).map((r) => [r.path, `${SUPABASE_URL}/storage/v1${r.signedURL}`]));
}

// Rename an object within one bucket (fails if the destination exists).
export async function moveInStorage(bucket: string, fromPath: string, toPath: string) {
  await adminFetch('/storage/v1/object/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId: bucket, sourceKey: fromPath, destinationKey: toPath }),
  });
}

export async function deleteFromStorage(bucket: string, paths: string[]) {
  if (paths.length === 0) return;
  await adminFetch(`/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
  });
}
