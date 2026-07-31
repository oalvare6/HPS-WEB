import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { MatchWithDetails } from "@/lib/types";

export function formatMatchDate(iso: string | null): string {
  if (!iso) return "Date TBA";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export const chip = cva(
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-zinc-500/15 text-zinc-400",
        brand: "bg-brand/15 text-brand",
        win: "bg-green-500/15 text-green-400",
        warn: "bg-yellow-500/15 text-yellow-300",
        danger: "bg-red-500/15 text-red-300",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export type ChipTone = "neutral" | "brand" | "win" | "warn" | "danger";

/**
 * Status chips for a match row/card, derived from status + notes so the seed
 * data stays the single source of truth (no extra flags to maintain).
 */
export function matchChips(m: MatchWithDetails): { label: string; tone: ChipTone }[] {
  const chips: { label: string; tone: ChipTone }[] = [];
  const note = (m.notes ?? "").toLowerCase();
  if (m.status === "completed") {
    if (note.includes("forfeit") || note.includes("technical")) {
      chips.push({ label: "Technical", tone: "warn" });
    } else {
      chips.push({ label: "FT", tone: "neutral" });
    }
    if (note.includes("double points")) {
      chips.push({ label: "2× pts", tone: "brand" });
    }
  } else if (m.status === "postponed") {
    chips.push({ label: "Postponed", tone: "warn" });
  } else if (m.status === "cancelled") {
    chips.push({ label: "Cancelled", tone: "danger" });
  }
  return chips;
}

/**
 * Team name with its kit-color bar — condensed broadcast type, tinted by the
 * team's own color rather than the site accent.
 */
export function TeamMark({
  name,
  color,
  align = "left",
  strong = false,
  size = "md",
}: {
  name: string;
  color: string | null;
  align?: "left" | "right";
  strong?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 min-w-0",
        align === "right" && "flex-row-reverse text-right"
      )}
    >
      <span
        aria-hidden
        className={cn("w-1 rounded-full flex-shrink-0", size === "lg" ? "h-5" : "h-4")}
        style={{ backgroundColor: color || "#3f3f46" }}
      />
      <span
        className={cn(
          "truncate font-condensed uppercase tracking-wide",
          size === "lg" ? "text-lg md:text-xl" : "text-[15px]",
          strong ? "text-white font-semibold" : "text-zinc-300 font-medium"
        )}
      >
        {name}
      </span>
    </span>
  );
}

export function ScorerList({
  goals,
  align = "left",
}: {
  goals: { scorer_name: string; goals: number }[];
  align?: "left" | "right";
}) {
  if (goals.length === 0) return null;
  return (
    <span className={cn("block text-xs leading-relaxed text-zinc-400", align === "right" && "text-right")}>
      {goals
        .map((g) => (g.goals > 1 ? `${g.scorer_name} ${g.goals}` : g.scorer_name))
        .join(", ")}
    </span>
  );
}
