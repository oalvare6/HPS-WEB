import { cache } from "react";
import { getSiteSetting, type StatusPill } from "@/lib/site-settings";
import { getRegistrationOpenTournaments } from "@/lib/tournaments";

/**
 * The status dots in the homepage hero, from one place.
 *
 * "Registration Open" used to be the first default of the `home.status_pills`
 * setting, so the hero said registration was open whatever the events were
 * doing — the same hardcoded-flag failure the calendar backstop in
 * `tournament-state.ts` exists to prevent, one level up. The first dot is now
 * derived from the events through the same loader `/register` uses to build
 * its picker, so it cannot say "open" when that screen would say "closed".
 * The operator's own pills (facility status the site cannot know) follow it.
 *
 * Only the homepage reads this. The header shows the operator's pills alone:
 * it is baked into the static pages at build time, where a derived claim
 * would freeze at the last deploy (see `components/layout/header.tsx`).
 *
 * `cache()`-wrapped so anything else rendered in the same request shares the
 * one query.
 */
export const getHomeStatusPills = cache(async (): Promise<StatusPill[]> => {
  const [{ tournaments: openForSignup }, operatorPills] = await Promise.all([
    getRegistrationOpenTournaments(),
    getSiteSetting("home.status_pills"),
  ]);
  const registrationPill: StatusPill =
    openForSignup.length > 0
      ? { label: "Registration open", status: "open" }
      : { label: "Registration closed", status: "closed" };
  return [registrationPill, ...operatorPills];
});
