// Shared CORS helpers for all edge functions in this project.
//
// We dynamically reflect the request Origin back when it matches our
// allowlist, instead of returning '*'. This blocks browser-based abuse
// from arbitrary websites while keeping the existing flows working:
//
//   * Production: locator.hdbrite.com
//   * Production alias: locator-final.vercel.app
//   * Vercel preview deployments for this project
//   * Local dev (localhost / 127.0.0.1, any port)
//
// Note: CORS only protects against browser-initiated cross-origin requests.
// Server-side abuse via curl/scripts is unaffected by this and is handled
// by the auth checks inside each function.

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/locator\.hdbrite\.com$/,
  /^https:\/\/locator-final\.vercel\.app$/,
  // Vercel preview/branch URLs for this project. Pattern covers:
  //   locator-final-<hash>.vercel.app
  //   locator-final-<hash>-<team-slug>.vercel.app
  //   locator-final-git-<branch>-<team-slug>.vercel.app
  /^https:\/\/locator-final-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const isAllowed = origin !== '' && ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    // Vary: Origin is essential so caches/CDNs don't serve a response cached
    // for one origin to a request from a different origin.
    'Vary': 'Origin',
  };
}
