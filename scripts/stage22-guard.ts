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
