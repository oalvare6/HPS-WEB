import { cn } from "@/lib/utils";

const SIZE = {
  sm: "font-mono text-base font-bold",
  lg: "font-display text-4xl md:text-5xl",
  xl: "font-display text-5xl md:text-7xl",
} as const;

/** The scoreline itself — oversized display numerals for the broadcast look. */
export function Scoreline({
  home,
  away,
  size = "sm",
  className,
}: {
  home: number | null;
  away: number | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline tabular-nums leading-none text-white",
        SIZE[size],
        className
      )}
    >
      {home ?? "–"}
      <span className={cn("text-zinc-600", size === "sm" ? "mx-1" : "mx-2")}>–</span>
      {away ?? "–"}
    </span>
  );
}
