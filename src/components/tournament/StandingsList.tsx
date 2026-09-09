import type { StandingsRow } from "@/lib/types";
import { TeamLabel } from "./primitives";

export type StandingsSource = "computed" | "published";

/**
 * This season's format, stated once. Drawn as a hairline under the 4th row of
 * a computed table whenever the schedule has a round that does not count
 * toward the table (semi-finals, exhibition, final).
 */
const PLAYOFF_CUT_AFTER = 4;
const PLAYOFF_CAPTION =
  "Top 4 go to the semi-finals. 5th and 6th play an exhibition.";
const TIEBREAK_FOOTNOTE = "Tiebreak: points, goal difference, goals scored.";
const PUBLISHED_CAPTION = "Final table as published.";

const COLUMNS: { key: keyof StandingsRow; abbr: string; title: string }[] = [
  { key: "played", abbr: "P", title: "Played" },
  { key: "won", abbr: "W", title: "Won" },
  { key: "drawn", abbr: "D", title: "Drawn" },
  { key: "lost", abbr: "L", title: "Lost" },
  { key: "goals_for", abbr: "GF", title: "Goals for" },
  { key: "goals_against", abbr: "GA", title: "Goals against" },
  { key: "goal_difference", abbr: "GD", title: "Goal difference" },
];

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

type Props = {
  standings: StandingsRow[];
  standingsSource: StandingsSource;
  /** True when at least one round does not count toward the table. */
  showCutLine: boolean;
};

/**
 * The league table. Below `md` it is a list (one row per team, big points
 * number, the rest on a second line) so nothing scrolls sideways on a phone;
 * from `md` up it is the full table. Published rows (the World Cup override)
 * are opaque: rendered in the order given, no cut line, nothing derived.
 */
export function StandingsList({ standings, standingsSource, showCutLine }: Props) {
  const published = standingsSource === "published";
  const cut = !published && showCutLine && standings.length > PLAYOFF_CUT_AFTER;

  if (standings.length === 0) {
    return (
      <p className="dashboard-card px-4 py-6 text-center text-sm text-zinc-500">
        The table fills in after the first results.
      </p>
    );
  }

  const cutRowCls = (i: number) =>
    cut && i === PLAYOFF_CUT_AFTER - 1 ? "border-b-2 border-brand/60" : "";

  return (
    <div>
      {/* Phone: list */}
      <ol className="md:hidden dashboard-card overflow-hidden divide-y divide-border-token/60">
        {standings.map((r, i) => (
          <li
            key={r.team_id}
            className={`flex items-center gap-3 px-4 py-3 ${cutRowCls(i)}`}
          >
            <span className="w-5 text-right font-mono text-sm text-zinc-500 tabular-nums flex-shrink-0">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <TeamLabel name={r.team_name} color={r.team_color} strong className="max-w-full" />
              <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-zinc-400 tabular-nums">
                <span className="whitespace-nowrap">P {r.played}</span>
                <span aria-hidden className="text-zinc-600">·</span>
                <span className="whitespace-nowrap">
                  W {r.won} D {r.drawn} L {r.lost}
                </span>
                <span aria-hidden className="text-zinc-600">·</span>
                <span className="whitespace-nowrap">
                  GF {r.goals_for} GA {r.goals_against}
                </span>
                <span aria-hidden className="text-zinc-600">·</span>
                <span className="whitespace-nowrap">GD {signed(r.goal_difference)}</span>
              </p>
            </div>
            <div className="flex-shrink-0 text-right leading-none">
              <span className="block font-mono text-xl font-bold text-white tabular-nums">
                {r.points}
              </span>
              <span className="block text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">
                Pts
              </span>
            </div>
          </li>
        ))}
      </ol>

      {/* md and up: full table */}
      <div className="hidden md:block dashboard-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-mono uppercase tracking-wider text-zinc-500 border-b border-border-token">
              <th scope="col" className="text-left font-medium px-4 py-3 w-8">
                <abbr title="Position" className="no-underline">#</abbr>
              </th>
              <th scope="col" className="text-left font-medium px-2 py-3">
                Team
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" className="text-center font-medium px-2 py-3">
                  <abbr title={c.title} className="no-underline">{c.abbr}</abbr>
                </th>
              ))}
              <th scope="col" className="text-center font-semibold px-4 py-3 text-zinc-300">
                <abbr title="Points" className="no-underline">Pts</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((r, i) => (
              <tr
                key={r.team_id}
                className={`border-b border-border-token/60 last:border-0 hover:bg-surface-2/40 transition-colors ${cutRowCls(i)}`}
              >
                <td className="px-4 py-3 text-zinc-500 font-mono tabular-nums">{i + 1}</td>
                <td className="px-2 py-3">
                  <TeamLabel name={r.team_name} color={r.team_color} strong />
                </td>
                {COLUMNS.map((c) => (
                  <td
                    key={c.key}
                    className={`text-center px-2 py-3 tabular-nums ${
                      c.key === "goals_for" || c.key === "goals_against"
                        ? "text-zinc-400"
                        : "text-zinc-300"
                    }`}
                  >
                    {c.key === "goal_difference" ? signed(r.goal_difference) : r[c.key]}
                  </td>
                ))}
                <td className="text-center px-4 py-3 font-mono font-bold text-white tabular-nums">
                  {r.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 space-y-0.5 text-xs text-zinc-500">
        {published ? (
          <p>{PUBLISHED_CAPTION}</p>
        ) : (
          <>
            {cut && <p>{PLAYOFF_CAPTION}</p>}
            <p>{TIEBREAK_FOOTNOTE}</p>
          </>
        )}
      </div>
    </div>
  );
}
