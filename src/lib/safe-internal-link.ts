/**
 * Restricts values used in <Link href> to same-site path navigation only,
 * avoiding javascript:/data: URLs and protocol-relative //evil.com links.
 */
export function safeInternalLink(
  raw: string | null | undefined,
  fallback: string
): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return fallback;

  const scheme = s.split(":")[0]?.toLowerCase() ?? "";
  if (
    scheme === "javascript" ||
    scheme === "data" ||
    scheme === "vbscript" ||
    s.toLowerCase().startsWith("javascript:") ||
    s.toLowerCase().startsWith("data:") ||
    s.toLowerCase().startsWith("vbscript:")
  ) {
    return fallback;
  }

  if (s.startsWith("/") && !s.startsWith("//")) {
    const pathOnly = s.split(/[?#]/, 1)[0] ?? s;
    if (pathOnly.includes("..")) return fallback;
    return s;
  }

  return fallback;
}

/** For API writes: keep only safe internal paths; otherwise null. */
export function sanitizeOptionalInternalPath(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const s = safeInternalLink(t, "");
  return s.length > 0 ? s : null;
}
