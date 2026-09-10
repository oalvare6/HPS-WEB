/**
 * Stage 2.2 isolation guard.
 *
 * Every Stage 2.2 action — launching the app, applying a migration, seeding a
 * row — must first prove it is pointed at the isolated `hps-dev` project and
 * not at Production. This module is that proof, in one place, so there is only
 * one thing to audit and one thing to test.
 *
 * The rule is deliberately stricter than "is it not Production":
 *
 *   1. The operator names the intended target once, as `HPS_DEV_PROJECT_REF`.
 *   2. Every value that could carry a target — the API URL, the database URI,
 *      a ref passed to a connector call — must resolve to *that* ref.
 *   3. Anything mentioning the Production ref is refused outright, wherever in
 *      the string it appears.
 *
 * Rule 2 is what matters. A denylist alone only rejects the target you thought
 * of; requiring an exact match to a pre-declared ref rejects every target you
 * did not. Rule 3 is the belt-and-braces catch for a string this module cannot
 * parse — a custom hostname, a pooler URI in a shape we have not seen.
 *
 * `PRODUCTION_SUPABASE_REF` below is a denylist entry, not a credential. It is
 * already recorded in docs/STAGE-2-2-SETUP-CHECKLIST.md §1 and
 * docs/CLAUDE-STAGE-2-HANDOFF.md; a project ref is not a secret, and this guard
 * cannot refuse a ref it is not allowed to name.
 */

import { readFileSync } from "node:fs";

/** Production. Never a valid Stage 2.2 target, in any field, in any form. */
export const PRODUCTION_SUPABASE_REF = "jqkiswwunrnyqjgroqtn";

/** Supabase project refs are 20 lowercase letters. */
const REF_PATTERN = /^[a-z]{20}$/;

/** `<ref>.supabase.co` and `db.<ref>.supabase.co`. */
const HOST_PATTERN = /^(?:db\.)?([a-z]{20})\.supabase\.(?:co|net|in)$/;

/** Session/transaction pooler carries the ref in the username: `postgres.<ref>`. */
const POOLER_USER_PATTERN = /^postgres\.([a-z]{20})$/;

/**
 * Environment variables that must never reach the Stage 2.2 process.
 *
 * Integration credentials (Stripe, DocuSeal, Resend) are excluded because a
 * development run must not be able to charge a card, request a signature or
 * send mail. `HPS_TEST_DATABASE_URL` is excluded because the reset-based
 * PostgreSQL suites clear and rebuild whatever schema they are handed, and this
 * project is persistent. `VERCEL_*` is excluded so nothing inherits a
 * deployment identity.
 */
export const FORBIDDEN_ENV_PREFIXES = [
  "STRIPE_",
  "NEXT_PUBLIC_STRIPE_",
  "DOCUSEAL_",
  "RESEND_",
  "RESUME_EMAIL_",
  "VERCEL_",
] as const;

export const FORBIDDEN_ENV_KEYS = [
  "HPS_TEST_DATABASE_URL",
  "ADMIN_SESSION_SECRET", // legacy alias; Stage 2.2 sets APP_SIGNING_SECRET only
] as const;

/**
 * The only variables inherited from the surrounding shell. Everything the app
 * reads is supplied explicitly from `.env.stage22.local`, so an operator's
 * ambient Supabase or Stripe values cannot leak into a development run.
 */
const INHERITED_OS_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "SHELL",
  "USER",
  "LOGNAME",
  "TERM",
  "NODE_EXTRA_CA_CERTS",
  // Windows equivalents, so the launcher also works on the operator's machine.
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
] as const;

export class Stage22GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Stage22GuardError";
  }
}

/** True when `value` is a syntactically valid Supabase project ref. */
export function isSupabaseRef(value: string | null | undefined): boolean {
  return typeof value === "string" && REF_PATTERN.test(value);
}

/**
 * Pull the project ref out of anything that names a Supabase target: a bare
 * ref, an API URL, a direct database hostname or a pooler URI.
 *
 * Returns `null` when the value names no Supabase project at all (a localhost
 * fixture URL, say). `null` means "cannot tell", never "safe" — callers treat
 * an unresolvable value according to whether a ref was required.
 */
export function extractSupabaseRef(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  if (REF_PATTERN.test(raw)) return raw;

  // Parse as a URI when it has a scheme; otherwise treat it as a bare hostname.
  let host = "";
  let username = "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      host = url.hostname;
      username = decodeURIComponent(url.username);
    } catch {
      return null;
    }
  } else {
    host = raw.split("/")[0].split("?")[0];
    // Strip a `user:pass@` prefix and a `:port` suffix from a bare authority.
    const at = host.lastIndexOf("@");
    if (at >= 0) {
      username = host.slice(0, at).split(":")[0];
      host = host.slice(at + 1);
    }
    host = host.replace(/:\d+$/, "");
  }

  const fromUser = POOLER_USER_PATTERN.exec(username.toLowerCase());
  if (fromUser) return fromUser[1];

  const fromHost = HOST_PATTERN.exec(host.toLowerCase());
  if (fromHost) return fromHost[1];

  return null;
}

/**
 * Refuse any string that mentions Production anywhere — API hostname, direct
 * database hostname, pooler username, or a bare ref pasted into a note.
 */
export function assertNotProduction(value: string | null | undefined, label: string): void {
  if (typeof value !== "string") return;
  if (value.toLowerCase().includes(PRODUCTION_SUPABASE_REF)) {
    throw new Stage22GuardError(
      `${label} names the Production project (${PRODUCTION_SUPABASE_REF}). ` +
        `Production is not a valid Stage 2.2 target. Refusing.`
    );
  }
}

/**
 * Validate the operator's declared development ref.
 *
 * Returns the ref so a caller can use the validated value rather than the raw
 * environment string.
 */
export function assertDevRef(expectedRef: string | null | undefined): string {
  if (typeof expectedRef !== "string" || !expectedRef.trim()) {
    throw new Stage22GuardError(
      "HPS_DEV_PROJECT_REF is not set. Stage 2.2 refuses to act without an " +
        "explicitly declared development target."
    );
  }
  const ref = expectedRef.trim();
  assertNotProduction(ref, "HPS_DEV_PROJECT_REF");
  if (!isSupabaseRef(ref)) {
    throw new Stage22GuardError(
      `HPS_DEV_PROJECT_REF is not a valid Supabase project ref: ${JSON.stringify(ref)}. ` +
        `Expected 20 lowercase letters.`
    );
  }
  return ref;
}

export interface Stage22Candidate {
  /** Human-readable name used in refusal messages, e.g. "NEXT_PUBLIC_SUPABASE_URL". */
  label: string;
  value: string | null | undefined;
  /** When true, the value must be present and must resolve to the dev ref. */
  required?: boolean;
}

/**
 * The one check every Stage 2.2 action runs before it touches anything.
 *
 * Proves that each supplied target names the declared development project and
 * nothing else. Throws `Stage22GuardError` on the first violation; returns the
 * validated ref when everything agrees.
 */
export function assertStage22Target(options: {
  expectedRef: string | null | undefined;
  candidates: Stage22Candidate[];
}): string {
  const ref = assertDevRef(options.expectedRef);

  for (const candidate of options.candidates) {
    const { label, value, required = false } = candidate;

    if (value == null || value === "") {
      if (required) {
        throw new Stage22GuardError(
          `${label} is required for this Stage 2.2 action but is not set.`
        );
      }
      continue;
    }

    assertNotProduction(value, label);

    const found = extractSupabaseRef(value);
    if (found === null) {
      if (required) {
        throw new Stage22GuardError(
          `${label} does not name a Supabase project, so it cannot be verified ` +
            `against the development ref ${ref}. Refusing.`
        );
      }
      continue;
    }
    if (found !== ref) {
      throw new Stage22GuardError(
        `${label} names project ${found}, but the approved Stage 2.2 target is ` +
          `${ref}. Refusing.`
      );
    }
  }

  return ref;
}

/** True when `key` must be kept out of a Stage 2.2 process. */
export function isForbiddenEnvKey(key: string): boolean {
  const upper = key.toUpperCase();
  if ((FORBIDDEN_ENV_KEYS as readonly string[]).includes(upper)) return true;
  return FORBIDDEN_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

/**
 * Build the child environment: ordinary OS variables plus exactly the values
 * Stage 2.2 supplies. Nothing else is inherited, and forbidden keys are dropped
 * even when they arrive through `supplied`.
 */
export function buildStage22Env(
  // Structural, not `NodeJS.ProcessEnv`: Next.js augments that type with a
  // required NODE_ENV, which would stop a caller passing a plain object.
  base: Record<string, string | undefined>,
  supplied: Record<string, string>
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of INHERITED_OS_KEYS) {
    const value = base[key];
    if (typeof value === "string" && value !== "") env[key] = value;
  }

  for (const [key, value] of Object.entries(supplied)) {
    if (isForbiddenEnvKey(key)) continue;
    env[key] = value;
  }

  return env;
}

/**
 * Minimal `.env` parser. Next.js does not load `.env.stage22.local`, and this
 * is deliberately not `dotenv`: the file holds development credentials and the
 * launcher should not depend on a package to read six lines of `KEY=value`.
 *
 * Supports `KEY=value`, `export KEY=value`, `#` comments, blank lines, and
 * single- or double-quoted values.
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.replace(/^export\s+/, "");
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      // Strip a trailing inline comment from an unquoted value.
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// API keys
//
// Supabase now issues `sb_publishable_…` / `sb_secret_…` keys alongside the
// legacy anon / service_role JWTs. Both forms work, and hps-dev has both
// enabled — but they are not interchangeable between slots, and only one of the
// four shapes can be checked offline for which project it belongs to.
//
// That asymmetry is the whole problem. A legacy JWT carries `ref` in its
// claims, so a wrong-project JWT can be caught before it is ever used. An
// `sb_secret_…` key carries nothing: it is an opaque string, so a secret key
// belonging to a DIFFERENT project is indistinguishable from the right one
// until something actually calls the API with it. Shape checking alone would
// therefore pass a key that cannot work — which is exactly the failure this
// section exists to make impossible.
// ---------------------------------------------------------------------------

export type SupabaseKeyKind =
  | "publishable"
  | "secret"
  | "legacy-anon"
  | "legacy-service-role"
  | "unknown";

export interface SupabaseKeyInfo {
  kind: SupabaseKeyKind;
  /** Project ref, when the key form carries one (legacy JWTs only). */
  ref: string | null;
  /** True for keys safe to ship to a browser. */
  isPublic: boolean;
  /** True for keys that bypass RLS and must stay server-side. */
  isElevated: boolean;
}

export function classifySupabaseKey(key: string | null | undefined): SupabaseKeyInfo {
  const unknown: SupabaseKeyInfo = { kind: "unknown", ref: null, isPublic: false, isElevated: false };
  if (typeof key !== "string" || !key.trim()) return unknown;
  const k = key.trim();

  if (k.startsWith("sb_publishable_")) {
    return { kind: "publishable", ref: null, isPublic: true, isElevated: false };
  }
  if (k.startsWith("sb_secret_")) {
    return { kind: "secret", ref: null, isPublic: false, isElevated: true };
  }

  const parts = k.split(".");
  if (parts.length !== 3) return unknown;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      role?: string;
      ref?: string;
    };
    const ref = typeof claims.ref === "string" ? claims.ref : null;
    if (claims.role === "anon") {
      return { kind: "legacy-anon", ref, isPublic: true, isElevated: false };
    }
    if (claims.role === "service_role") {
      return { kind: "legacy-service-role", ref, isPublic: false, isElevated: true };
    }
    return unknown;
  } catch {
    return unknown;
  }
}

/**
 * Check a key is the right *sort* of key for the slot it is in, and — where the
 * form allows it — that it names the expected project.
 *
 * This catches a swapped pair and a wrong-project legacy JWT offline. It cannot
 * catch a wrong-project `sb_secret_…` key; only `probeSupabaseKey` can.
 */
export function assertKeyFitsSlot(
  key: string | null | undefined,
  slot: "public" | "elevated",
  label: string,
  expectedRef: string
): SupabaseKeyInfo {
  assertNotProduction(key, label);
  const info = classifySupabaseKey(key);

  if (info.kind === "unknown") {
    throw new Stage22GuardError(
      `${label} is not a recognisable Supabase API key. Expected either a ` +
        `${slot === "public" ? "sb_publishable_… or legacy anon" : "sb_secret_… or legacy service_role"} key.`
    );
  }
  if (info.ref && info.ref !== expectedRef) {
    throw new Stage22GuardError(
      `${label} belongs to project ${info.ref}, but the approved target is ${expectedRef}.`
    );
  }
  if (slot === "public" && info.isElevated) {
    throw new Stage22GuardError(
      `${label} is an ELEVATED key (${info.kind}). It bypasses row-level security and must ` +
        `never be given to a browser. The keys are probably swapped.`
    );
  }
  if (slot === "elevated" && info.isPublic) {
    throw new Stage22GuardError(
      `${label} is a PUBLIC key (${info.kind}), which cannot act as the service role. ` +
        `Every server query would fail. The keys are probably swapped.`
    );
  }
  return info;
}

export interface KeyProbeResult {
  /** False when the API could not be reached at all (proxy, DNS, offline). */
  reachable: boolean;
  /**
   * False when the answer did not come from PostgREST — a proxy denial, a
   * captive portal, a 5xx from something in between.
   *
   * This field exists because of a real miss: an egress proxy answered
   * `403 Host not in allowlist`, which is not a 401, so a first version of this
   * code scored two entirely fake keys as "authenticated". Anything that is not
   * recognisably PostgREST proves nothing, and must never be read as success.
   */
  conclusive: boolean;
  /** True only when PostgREST itself accepted the key. */
  authenticated: boolean;
  status: number;
  /** Rows the key could actually read from the probed table. */
  rows: number;
  message: string;
}

/**
 * Ask the real project whether a key works.
 *
 * `Invalid API key` is a 401 from PostgREST and is the *only* way to learn that
 * an opaque `sb_secret_…` key belongs to another project. Note that a key which
 * authenticates but is blocked by RLS gets 200 and an empty array, not an
 * error — so row count, not status, is what distinguishes an elevated key from
 * a public one.
 */
export async function probeSupabaseKey(
  supabaseUrl: string,
  key: string,
  table: string,
  timeoutMs = 15000
): Promise<KeyProbeResult> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}?select=*&limit=5`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    let rows = 0;
    const text = await res.text();
    let message = `HTTP ${res.status}`;

    if (res.ok) {
      try {
        const parsed: unknown = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        /* not an array body */
      }
      return { reachable: true, conclusive: true, authenticated: true, status: res.status, rows, message };
    }

    message = `HTTP ${res.status}: ${text.slice(0, 200)}`;

    // A PostgREST error body is JSON carrying `message` and/or `code`. A proxy
    // denial or an HTML error page is not, and tells us nothing about the key.
    let looksLikePostgrest = false;
    try {
      const parsed = JSON.parse(text) as { message?: unknown; code?: unknown };
      looksLikePostgrest =
        typeof parsed?.message === "string" || typeof parsed?.code === "string";
    } catch {
      looksLikePostgrest = false;
    }

    if (!looksLikePostgrest) {
      return {
        reachable: true,
        conclusive: false,
        authenticated: false,
        status: res.status,
        rows: 0,
        message: `${message}  (not a PostgREST response — something between here and the project answered)`,
      };
    }

    // From here the answer is PostgREST's. "Invalid API key" is a rejected key;
    // any other 4xx means the key was accepted and the request then refused.
    const invalidKey = /invalid api key/i.test(text) || /jwt/i.test(text) && res.status === 401;
    return {
      reachable: true,
      conclusive: true,
      authenticated: !invalidKey,
      status: res.status,
      rows: 0,
      message,
    };
  } catch (error) {
    return {
      reachable: false,
      conclusive: false,
      authenticated: false,
      status: 0,
      rows: 0,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface KeyPreflightReport {
  ok: boolean;
  /** True when the network prevented any conclusion being drawn. */
  unreachable: boolean;
  lines: string[];
  problems: string[];
}

/**
 * Prove both keys actually authenticate to the approved project, and that the
 * public one is genuinely not elevated.
 *
 * `PUBLIC_TABLE` is readable by everyone through an RLS policy; `PRIVATE_TABLE`
 * has RLS on and no policy at all, so only a key that bypasses RLS sees rows in
 * it. That difference is the test.
 */
export async function preflightSupabaseKeys(options: {
  supabaseUrl: string;
  publicKey: string;
  elevatedKey: string;
  expectedRef: string;
}): Promise<KeyPreflightReport> {
  const { supabaseUrl, publicKey, elevatedKey, expectedRef } = options;
  const lines: string[] = [];
  const problems: string[] = [];

  const pubInfo = assertKeyFitsSlot(publicKey, "public", "NEXT_PUBLIC_SUPABASE_ANON_KEY", expectedRef);
  const elevInfo = assertKeyFitsSlot(elevatedKey, "elevated", "SUPABASE_SERVICE_ROLE_KEY", expectedRef);

  if (publicKey.trim() === elevatedKey.trim()) {
    problems.push("the public and server keys are the same value; one of them is wrong.");
  }

  const PUBLIC_TABLE = "tournaments";
  const PRIVATE_TABLE = "contacts";

  const pub = await probeSupabaseKey(supabaseUrl, publicKey, PUBLIC_TABLE);
  if (!pub.reachable || !pub.conclusive) {
    return {
      ok: false,
      unreachable: true,
      lines: [`could not get a PostgREST answer from ${supabaseUrl}`, `  ${pub.message}`],
      problems: [
        "the project could not be reached, or something in between answered instead, " +
          "so the keys were NOT verified. Nothing here says whether they work.",
      ],
    };
  }

  lines.push(`public key   ${pubInfo.kind.padEnd(20)} ${pub.authenticated ? "accepted" : "REJECTED"} (${pub.message})`);
  if (!pub.authenticated) {
    problems.push(
      `the public key was rejected by ${expectedRef}. Copy the current publishable ` +
        `(or legacy anon) key from the hps-dev dashboard.`
    );
  }

  const elev = await probeSupabaseKey(supabaseUrl, elevatedKey, PRIVATE_TABLE);
  if (!elev.reachable || !elev.conclusive) {
    return {
      ok: false,
      unreachable: true,
      lines: [...lines, `no PostgREST answer for the server key — ${elev.message}`],
      problems: ["the server key could NOT be verified."],
    };
  }
  lines.push(`server key   ${elevInfo.kind.padEnd(20)} ${elev.authenticated ? "accepted" : "REJECTED"} (${elev.message})`);
  if (!elev.authenticated) {
    problems.push(
      `the server key was rejected by ${expectedRef}. This is the key every admin ` +
        `query uses, so the whole admin fails without it. Copy the current secret ` +
        `(or legacy service_role) key from the hps-dev dashboard — and make sure it ` +
        `is hps-dev's, not another project's: an sb_secret_… key does not say which ` +
        `project it belongs to, so only this check can tell.`
    );
  } else if (elev.rows === 0) {
    lines.push(
      `             note: the server key read 0 rows from ${PRIVATE_TABLE}; it authenticates, ` +
        `but RLS bypass could not be confirmed on an empty table.`
    );
  } else {
    lines.push(`             server key reads ${PRIVATE_TABLE} (${elev.rows} row(s)) — RLS bypass confirmed.`);
  }

  // The public key must NOT be able to read a private table. If it can, it is
  // not a public key, whatever it is called.
  const pubPrivate = await probeSupabaseKey(supabaseUrl, publicKey, PRIVATE_TABLE);
  if (pubPrivate.conclusive && pubPrivate.rows > 0) {
    problems.push(
      `the public key can read ${pubPrivate.rows} row(s) from ${PRIVATE_TABLE}. A browser key ` +
        `must never see private data — this key is elevated and must not be used as the public key.`
    );
  } else if (pubPrivate.conclusive) {
    lines.push(`             public key reads 0 rows from ${PRIVATE_TABLE} — correctly not elevated.`);
  }

  return { ok: problems.length === 0, unreachable: false, lines, problems };
}

/** Read and parse `.env.stage22.local` (or another explicit path). */
export function loadEnvFile(filePath: string): Record<string, string> {
  let contents: string;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch {
    throw new Stage22GuardError(
      `Cannot read ${filePath}. Stage 2.2 needs its own environment file; ` +
        `see docs/STAGE-2-2-SETUP-CHECKLIST.md §3. It must never be .env.local.`
    );
  }
  return parseEnvFile(contents);
}
