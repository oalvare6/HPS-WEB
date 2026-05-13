import { TOURNAMENT_STATUSES, type TournamentStatus } from "@/lib/types";

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
