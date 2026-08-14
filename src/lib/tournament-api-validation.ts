import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseFreeEntryTournamentIds } from "@/lib/open-play-free-entry";
import {
  MAX_FEATURED_TOURNAMENTS,
  TOURNAMENT_STATUSES,
  type TournamentStatus,
} from "@/lib/types";

const STATUS_SET = new Set<string>(TOURNAMENT_STATUSES.map((s) => s.value));

export function parseTournamentStatus(v: unknown, fallback: TournamentStatus): TournamentStatus | "invalid" {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "string" || !STATUS_SET.has(v)) return "invalid";
  return v as TournamentStatus;
}

export function assertTournamentStatus(v: unknown): TournamentStatus | "invalid" {
  if (typeof v !== "string" || !STATUS_SET.has(v)) return "invalid";
  return v as TournamentStatus;
}

export function parseOptionalMoney(v: unknown): number | null | "invalid" {
  if (v === undefined || v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

export function parseOptionalNonNegInt(v: unknown): number | null | "invalid" {
  if (v === undefined || v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

/**
 * Free-entry config as it should be written to the row (D7).
 *
 * Two rules enforced here rather than in the UI, because the UI is not the only
 * caller and a stale admin tab is a caller too:
 *
 *  1. **Only an open-play night confers free entry.** Storing a list on a
 *     tournament would be dead config that a later reader could mistake for an
 *     active rule. A tournament always saves `[]`.
 *  2. **An event cannot comp itself.** Naming your own id would mean "everyone
 *     already signed up for tonight gets tonight free" — a rule that pays for
 *     itself in a circle. `excludeId` is the row being written (null on POST,
 *     where the id does not exist yet, so the case cannot arise).
 *
 * Anything unparseable degrades to `[]` — everybody pays — rather than 400ing a
 * save that is otherwise fine. Losing a fee is recoverable at the field; losing
 * the owner's edit to the date because of a malformed array is not.
 */
export function resolveFreeEntryTournamentIds(
  value: unknown,
  kind: string | null | undefined,
  excludeId: string | null
): string[] {
  if (kind !== "open_play") return [];
  const ids = parseFreeEntryTournamentIds(value);
  return excludeId ? ids.filter((id) => id !== excludeId.toLowerCase()) : ids;
}

/**
 * Returns a 409 response if turning `is_featured` on for the given tournament
 * would exceed the MAX_FEATURED_TOURNAMENTS cap. `excludeId` is the row being
 * updated (so PATCH doesn't count itself). Pass null on POST.
 *
 * Caller should only invoke this when `is_featured` is being set to true.
 */
export async function ensureFeaturedCapNotExceeded(
  excludeId: string | null
): Promise<NextResponse | null> {
  let query = supabaseAdmin
    .from("tournaments")
    .select("id", { count: "exact", head: true })
    .eq("is_featured", true);
  if (excludeId) {
    query = query.neq("id", excludeId);
  }
  const { count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_FEATURED_TOURNAMENTS) {
    return NextResponse.json(
      {
        error: `Only ${MAX_FEATURED_TOURNAMENTS} tournaments can be featured at once. Unfeature another first.`,
      },
      { status: 409 }
    );
  }
  return null;
}

export function bufferMatchesImageMime(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  if (mime === "image/jpeg") {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === "image/png") {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return sig.every((b, i) => buf[i] === b);
  }
  if (mime === "image/webp") {
    return (
      buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}
