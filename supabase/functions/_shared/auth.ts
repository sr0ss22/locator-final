// Shared auth helper for edge functions that need to accept BOTH:
//   * A signed-in admin/installer (verified via JWT)
//   * A public sharable installer URL (verified via installerId + territory_access_token)
//
// Returns { ok: true } when the request should be allowed, or
// { ok: false, reason } when it should be rejected with a 401.

// deno-lint-ignore-file no-explicit-any

export interface AuthBody {
  installerId?: string;
  token?: string;
}

export async function authorizeJwtOrToken(
  req: Request,
  body: AuthBody | null,
  supabaseAdmin: any,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Path 1: Bearer JWT belonging to a real signed-in user.
  // We treat any successfully resolved user as authorized — these radius
  // functions are scoped tools, not privileged operations, so being signed
  // in is sufficient.
  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const jwt = authHeader.replace('Bearer ', '');
    try {
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
      if (!userError && userData?.user) {
        return { ok: true };
      }
    } catch {
      // Fall through to token check; the JWT was likely just the anon key.
    }
  }

  // Path 2: Public installer token (the URL pattern used by sharable links).
  if (body?.installerId && body?.token) {
    const { data: installer, error } = await supabaseAdmin
      .from('installers')
      .select('id, territory_access_token')
      .eq('id', body.installerId)
      .single();

    if (!error && installer && installer.territory_access_token === body.token) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    reason: 'Unauthorized: provide either a valid user session or a matching installerId+token.',
  };
}
