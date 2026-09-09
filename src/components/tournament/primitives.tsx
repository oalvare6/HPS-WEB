import { scorerLabel } from "@/lib/schedule";

/**
 * The two display atoms every public tournament list shares: a team name with
 * its colour dot, and a comma-joined scorer line. No hooks, no handlers, so
 * they render in server components and inside the client hub alike.
 */
export function TeamLabel({
  name,
  color,
  align = "left",
  strong = false,
  placeholder = false,
  className = "",
}: {
  name: string;
  color: string | null;
  align?: "left" | "right";
  strong?: boolean;
  /** A bracket slot ("1st place", "Winner SF1") rather than a real team. */
  placeholder?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 min-w-0 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      } ${className}`}
    >
      {placeholder ? (
        <span
          aria-hidden
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-dashed border-zinc-500"
        />
      ) : (
        <span
          aria-hidden
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/10"
          style={{ backgroundColor: color || "#3f3f46" }}
        />
      )}
      <span
        className={`truncate ${
          placeholder
            ? "text-zinc-400 italic"
            : strong
              ? "text-white font-semibold"
              : "text-zinc-200"
        }`}
      >
        {name}
      </span>
    </span>
  );
}

export function ScorerList({
  goals,
  className = "",
}: {
  goals: { scorer_name: string; goals: number; own_goal?: boolean | null }[];
  className?: string;
}) {
  if (goals.length === 0) return null;
  return (
    <span className={`text-xs text-zinc-400 ${className}`}>
      {goals.map(scorerLabel).join(", ")}
    </span>
  );
}
