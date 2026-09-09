/**
 * Same-origin check for cookie-authenticated, state-changing routes.
 *
 * The app has no CSRF token scheme (the admin relies on SameSite=Lax alone),
 * so this is the minimal reliable check: the request's `Origin` header — or,
 * failing that, the origin of `Referer` — must match the host the request was
 * served on, or the configured public site URL. `Sec-Fetch-Site` is consulted
 * as an extra rejection signal but is never sufficient on its own.
 *
 * Browsers always send `Origin` on cross-site POSTs and on same-origin `fetch`
 * POSTs; a request with neither `Origin` nor `Referer` is refused. SameSite=Lax
 * on the cookie remains the second layer.
 */

function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function requestOrigin(headers: Headers): string | null {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return null;
  const proto = headers.get("x-forwarded-proto") ?? "https";
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`.toLowerCase();
}

export type SameOriginVerdict = { ok: true } | { ok: false; reason: string };

export function checkSameOrigin(
  headers: Headers,
  siteUrl: string | null | undefined = process.env.NEXT_PUBLIC_SITE_URL
): SameOriginVerdict {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return { ok: false, reason: "cross-site" };
  }

  const allowed = new Set<string>();
  const served = requestOrigin(headers);
  if (served) allowed.add(served);
  const configured = originOf(siteUrl ?? null);
  if (configured) allowed.add(configured);

  const origin = originOf(headers.get("origin"));
  if (origin) {
    return allowed.has(origin) ? { ok: true } : { ok: false, reason: "origin-mismatch" };
  }

  const referer = originOf(headers.get("referer"));
  if (referer) {
    return allowed.has(referer) ? { ok: true } : { ok: false, reason: "referer-mismatch" };
  }

  return { ok: false, reason: "no-origin" };
}
