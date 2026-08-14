/**
 * Canonical host enforcement.
 *
 * Vercel auto-assigns several aliases to a production deployment. On
 * 2026-08-14 this project had **five** hosts serving the identical live site:
 *
 *   www.houstonpremiersoccer.com          ← the real one
 *   hps-web-three.vercel.app
 *   hps-web-oalvare6s-projects.vercel.app
 *   hps-web-git-main-oalvare6s-projects.vercel.app
 *   hps-etj8vxdbv-oalvare6s-projects.vercel.app
 *
 * Every one of them rendered a fully working copy — same database, same
 * Stripe, real signups. That is not a cosmetic problem:
 *
 *  - **Sessions do not carry across them.** Cookies are per-host, and
 *    `.vercel.app` is on the Public Suffix List, so a session created on an
 *    alias can never be seen on the real domain. A player who lands on one
 *    signs in, comes back to the real site later, and is signed out — with no
 *    way to tell why. The same split hits the admin cookie.
 *  - **Search engines index the duplicates**, so a player can arrive at one
 *    from a search result without ever having been given the link.
 *  - Supabase's Site URL pointed at one of these until 2026-08-14, which is
 *    exactly how players ended up there (see docs/AUTH-CONFIG.md §1).
 *
 * Vercel's Hobby plan gives no way to remove the aliases, so the fix is to
 * refuse to serve on them: a 308 to the same path on the canonical host.
 *
 * **Preview deployments are deliberately exempt.** They are supposed to live
 * on a `.vercel.app` host — redirecting them to production would make every
 * preview untestable, which is the opposite of what previews are for. The
 * check keys off `VERCEL_ENV`, which is `'production'` only for production
 * deployments; previews report `'preview'` and local dev reports nothing.
 */

/** The one host this site is allowed to serve on in production. */
export const CANONICAL_HOST = "www.houstonpremiersoccer.com";

/**
 * Hosts that must keep serving directly rather than redirecting.
 *
 * The apex is here because Vercel already 307s it to www at the edge, before
 * this code runs. Listing it costs nothing and documents that the apex is
 * expected traffic rather than an oversight.
 */
const ALLOWED_HOSTS = new Set([CANONICAL_HOST, "houstonpremiersoccer.com"]);

/**
 * Where this request should be redirected to, or `null` to serve it as-is.
 *
 * Split out from the middleware so the host rules are testable without a
 * request object — see `scripts/test-canonical-host.ts`.
 *
 * @param host       The `Host` header, which may include a port.
 * @param vercelEnv  `process.env.VERCEL_ENV`. Only `'production'` redirects.
 */
export function canonicalRedirectHost(
  host: string | null | undefined,
  vercelEnv: string | undefined
): string | null {
  // Anything that is not a production deployment serves wherever it is asked
  // to: previews on their own hostnames, `next dev` on localhost.
  if (vercelEnv !== "production") return null;

  const raw = (host ?? "").trim().toLowerCase();
  if (!raw) return null;

  // Strip the port before matching. A `Host` of `www.example.com:443` is the
  // same host as `www.example.com`, and treating them differently would send
  // a request into a redirect loop.
  const withoutPort = raw.split(":")[0];
  if (!withoutPort) return null;

  if (ALLOWED_HOSTS.has(withoutPort)) return null;

  return CANONICAL_HOST;
}
