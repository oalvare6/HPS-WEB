import { MATCH_STATUSES, type MatchStatus } from "@/lib/types";

const STATUS_SET = new Set<string>(MATCH_STATUSES);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string };

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function parseOptionalUuid(
  raw: unknown,
  field: string
): Ok<string | null> | Err {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !UUID_RE.test(raw)) {
    return { ok: false, error: `${field} must be a valid id.` };
  }
  return { ok: true, value: raw };
}

export function parseOptionalLabel(
  raw: unknown,
  field: string,
  max: number
): Ok<string | null> | Err {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: `${field} must be a string.` };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > max) {
    return { ok: false, error: `${field} is too long (max ${max} chars).` };
  }
  return { ok: true, value: trimmed };
}

export function parseOptionalScore(
  raw: unknown,
  field: string
): Ok<number | null> | Err {
  if (raw == null || raw === "") return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return { ok: false, error: `${field} must be a whole number of 0 or more.` };
  }
  if (n > 999) return { ok: false, error: `${field} is unrealistically large.` };
  return { ok: true, value: n };
}

export function parseOptionalDate(
  raw: unknown,
  field: string
): Ok<string | null> | Err {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !ISO_DATE_RE.test(raw)) {
    return { ok: false, error: `${field} must be a YYYY-MM-DD date.` };
  }
  return { ok: true, value: raw };
}

export function parseStatus(raw: unknown): Ok<MatchStatus> | Err {
  if (raw == null || raw === "") return { ok: true, value: "scheduled" };
  if (typeof raw !== "string" || !STATUS_SET.has(raw)) {
    return { ok: false, error: "Invalid match status." };
  }
  return { ok: true, value: raw as MatchStatus };
}

/** Goals tally for a scorer. Returns null when invalid; defaults to 1 when blank. */
export function parseGoals(raw: unknown): number | null {
  if (raw == null || raw === "") return 1;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 99) return null;
  return n;
}
