"use client";

import { useMemo, useState } from "react";
import type {
  MatchWithDetails,
  StandingsRow,
  TopScorers,
  TournamentRound,
} from "@/lib/types";
import {
  groupMatchesByRound,
  openRoundKeys,
  roundCountsTowardTable,
} from "@/lib/schedule";
import { HubTabs, hubPanelId, hubTabId } from "./HubTabs";
import { StandingsList, type StandingsSource } from "./StandingsList";
import { MatchList } from "./MatchList";
import { ScorersList } from "./ScorersList";
import type { HubTab } from "./hub-tab";

export { TeamLabel, ScorerList } from "./primitives";
export type { HubTab } from "./hub-tab";

type Props = {
  matches: MatchWithDetails[];
  rounds: TournamentRound[];
  standings: StandingsRow[];
  standingsSource: StandingsSource;
  topScorers: TopScorers;
  initialTab: HubTab;
};

/**
 * Table · Matches · Scorers for a live tournament. The page reads `?tab=` and
 * passes `initialTab`; the hub keeps the choice in state and mirrors it into
 * the URL with `history.replaceState`, so a tap costs no server round trip
 * (the page is force-dynamic) and a shared link opens on the same tab.
 *
 * All three panels stay mounted and the inactive ones are `hidden`: the
 * `aria-controls` targets always exist, and an opened round survives a switch
 * to the table and back.
 */
export function TournamentHub({
  matches,
  rounds,
  standings,
  standingsSource,
  topScorers,
  initialTab,
}: Props) {
  const [tab, setTab] = useState<HubTab>(initialTab);

  const groups = useMemo(() => groupMatchesByRound(rounds, matches), [rounds, matches]);
  const openKeys = useMemo(() => openRoundKeys(groups), [groups]);
  const showCutLine = useMemo(
    () => rounds.some((r) => !roundCountsTowardTable(r)),
    [rounds]
  );

  const select = (next: HubTab) => {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // A URL we cannot rewrite is not worth breaking the tab for.
    }
  };

  return (
    <div id="hub" className="scroll-mt-24 space-y-4">
      <HubTabs value={tab} onChange={select} />

      <div
        role="tabpanel"
        id={hubPanelId("table")}
        aria-labelledby={hubTabId("table")}
        hidden={tab !== "table"}
      >
        <StandingsList
          standings={standings}
          standingsSource={standingsSource}
          showCutLine={showCutLine}
        />
      </div>

      <div
        role="tabpanel"
        id={hubPanelId("matches")}
        aria-labelledby={hubTabId("matches")}
        hidden={tab !== "matches"}
      >
        <MatchList groups={groups} openKeys={openKeys} />
      </div>

      <div
        role="tabpanel"
        id={hubPanelId("scorers")}
        aria-labelledby={hubTabId("scorers")}
        hidden={tab !== "scorers"}
      >
        <ScorersList topScorers={topScorers} />
      </div>
    </div>
  );
}
