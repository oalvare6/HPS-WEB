"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "motion/react";
import type {
  MatchWithDetails,
  ScorerRow,
  StandingsRow,
  TournamentRound,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { BracketView, type BracketStage } from "./BracketView";
import { NextMatchHero } from "./NextMatchHero";
import { ResultsTab } from "./ResultsTab";
import { ScheduleTab } from "./ScheduleTab";
import { ScorersTab } from "./ScorersTab";
import { StandingsTab, type FormResult } from "./StandingsTab";

type TabKey = "schedule" | "results" | "standings" | "scorers";

type Props = {
  matches: MatchWithDetails[];
  rounds: TournamentRound[];
  standings: StandingsRow[];
  topScorers: ScorerRow[];
  /** Published rows that can't be matched to a named player; rendered muted. */
  unconfirmedScorers?: ScorerRow[];
  standingsCaption?: string | null;
  standingsFootnote?: string | null;
};

/** Rounds whose label marks a knockout stage rendered as a bracket. */
const KNOCKOUT_RE = /\b(final|semi|quarter)/i;

function computeForm(completed: MatchWithDetails[]): Map<string, FormResult[]> {
  const byTeam = new Map<string, FormResult[]>();
  const push = (teamId: string, r: FormResult) => {
    const list = byTeam.get(teamId) ?? [];
    list.push(r);
    byTeam.set(teamId, list);
  };
  for (const m of completed) {
    if (!m.home_team_id || !m.away_team_id || m.home_score == null || m.away_score == null) {
      continue;
    }
    if (m.home_score > m.away_score) {
      push(m.home_team_id, "W");
      push(m.away_team_id, "L");
    } else if (m.home_score < m.away_score) {
      push(m.home_team_id, "L");
      push(m.away_team_id, "W");
    } else {
      push(m.home_team_id, "D");
      push(m.away_team_id, "D");
    }
  }
  for (const [teamId, list] of byTeam) {
    byTeam.set(teamId, list.slice(-5));
  }
  return byTeam;
}

function TabPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function TournamentHub({
  matches,
  rounds,
  standings,
  topScorers,
  unconfirmedScorers,
  standingsCaption,
  standingsFootnote,
}: Props) {
  const completed = useMemo(
    () => matches.filter((m) => m.status === "completed" && m.home_score != null),
    [matches]
  );
  const hasStandings = standings.some((r) => r.played > 0);
  const hasScorers = topScorers.length > 0 || (unconfirmedScorers?.length ?? 0) > 0;

  // Knockout stages (semis/final) render as a bracket; the group-stage
  // schedule keeps the flat round list.
  const stages: BracketStage[] = useMemo(() => {
    return rounds
      .filter((r) => KNOCKOUT_RE.test(r.label))
      .map((round) => ({
        round,
        matches: matches.filter((m) => m.round_id === round.id),
      }))
      .filter((s) => s.matches.length > 0);
  }, [matches, rounds]);
  const knockoutRoundIds = useMemo(
    () => new Set(stages.map((s) => s.round.id)),
    [stages]
  );
  const groupMatches = useMemo(
    () => matches.filter((m) => !m.round_id || !knockoutRoundIds.has(m.round_id)),
    [matches, knockoutRoundIds]
  );
  const groupRounds = useMemo(
    () => rounds.filter((r) => !knockoutRoundIds.has(r.id)),
    [rounds, knockoutRoundIds]
  );

  // 2 teams per knockout match in the earliest stage = qualification spots.
  const qualificationSpots = stages.length > 0 ? stages[0].matches.length * 2 : 0;
  const qualificationLabel =
    stages.length > 0 ? `Top ${qualificationSpots} advanced to ${stages[0].round.label}` : null;

  const nextMatch = useMemo(
    () => matches.find((m) => m.status === "scheduled" && (m.home_team || m.home_team_label)),
    [matches]
  );
  const nextMatchRound = nextMatch?.round_id
    ? rounds.find((r) => r.id === nextMatch.round_id)?.label ?? null
    : null;

  const form = useMemo(() => computeForm(completed), [completed]);

  const tabs = useMemo(() => {
    const list: { key: TabKey; label: string }[] = [];
    if (matches.length > 0 || rounds.length > 0) {
      list.push({ key: "schedule", label: "Schedule" });
    }
    if (completed.length > 0) {
      list.push({ key: "results", label: "Results" });
    }
    if (hasStandings) {
      list.push({ key: "standings", label: "Standings" });
    }
    if (hasScorers) {
      list.push({ key: "scorers", label: "Top Scorers" });
    }
    return list;
  }, [matches.length, rounds.length, completed.length, hasStandings, hasScorers]);

  const defaultTab: TabKey = hasStandings ? "standings" : tabs[0]?.key ?? "schedule";

  // Tab state lives in ?tab= so a specific view is shareable and survives
  // refresh; invalid values fall back to the default.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const active: TabKey = tabs.some((t) => t.key === tabParam)
    ? (tabParam as TabKey)
    : defaultTab;
  const setActive = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultTab) {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  if (tabs.length === 0) return null;

  return (
    <div className="space-y-5">
      {nextMatch && completed.length > 0 && (
        <NextMatchHero match={nextMatch} roundLabel={nextMatchRound} />
      )}

      <Tabs.Root value={active} onValueChange={setActive}>
        <Tabs.List
          aria-label="Tournament information"
          className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-border-token"
        >
          {tabs.map((t) => (
            <Tabs.Trigger
              key={t.key}
              value={t.key}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 border-transparent px-4 py-2.5",
                "font-condensed text-[15px] font-semibold uppercase tracking-wider",
                "text-zinc-400 transition-colors hover:text-zinc-200",
                "data-[state=active]:border-brand data-[state=active]:text-white",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-0 rounded-t"
              )}
            >
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="schedule" className="focus-visible:outline-none">
          <TabPanel>
            <div className="space-y-6">
              {stages.length > 0 && <BracketView stages={stages} />}
              <ScheduleTab matches={groupMatches} rounds={groupRounds} />
            </div>
          </TabPanel>
        </Tabs.Content>

        <Tabs.Content value="results" className="focus-visible:outline-none">
          <TabPanel>
            <ResultsTab matches={completed} rounds={rounds} />
          </TabPanel>
        </Tabs.Content>

        <Tabs.Content value="standings" className="focus-visible:outline-none">
          <TabPanel>
            <StandingsTab
              standings={standings}
              form={form}
              qualificationSpots={qualificationSpots}
              qualificationLabel={qualificationLabel}
              caption={standingsCaption}
              footnote={standingsFootnote}
            />
          </TabPanel>
        </Tabs.Content>

        <Tabs.Content value="scorers" className="focus-visible:outline-none">
          <TabPanel>
            <ScorersTab scorers={topScorers} unconfirmed={unconfirmedScorers} />
          </TabPanel>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
