// Next.js 16 treats a thrown Error from a Server Action as an "uncaught
// exception" and redacts its message in production (replaced with a
// generic "Minified React error #NNN" digest) -- confirmed against this
// project's own bundled docs (node_modules/next/dist/docs/01-app/
// 01-getting-started/10-error-handling.md): "expected errors" like
// validation/business-rule failures are supposed to be modeled as return
// values, not thrown, specifically so the message survives to the client.
//
// This wraps an action's existing implementation (which can go on
// throwing Error internally, unchanged) so the exported version always
// resolves to a plain, serializable result instead of ever rejecting --
// callers check `.ok` instead of using try/catch.
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// redirect()/notFound()/forbidden()/unauthorized() all work by throwing a
// framework-recognized control-flow error tagged with a `digest` string
// (confirmed against node_modules/next/dist/client/components/
// redirect-error.js and http-access-fallback.js) -- a generic catch here
// would swallow that digest and turn an intended redirect into a normal
// "something went wrong" result instead of navigating. Re-thrown so Next
// still handles it the way every action calling redirect() expects.
function isFrameworkControlFlowError(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_HTTP_ERROR_FALLBACK'));
}

export function safeAction<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>
): (...args: Args) => Promise<ActionResult<T>> {
  return async (...args: Args) => {
    try {
      const data = await fn(...args);
      return { ok: true, data };
    } catch (e) {
      if (isFrameworkControlFlowError(e)) throw e;
      return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
    }
  };
}
