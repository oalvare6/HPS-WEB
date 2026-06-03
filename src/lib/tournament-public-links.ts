import { safeInternalLink } from "@/lib/safe-internal-link";

type TournamentLinkFields = {
  slug: string;
  register_url: string | null;
  pay_url: string | null;
};

/** Default `/register` and `/pay` paths include the tournament slug for gate + preselect. */
export function tournamentRegisterHref(tournament: TournamentLinkFields): string {
  const base = safeInternalLink(tournament.register_url, "/register");
  if (base === "/register") {
    return `/register?tournament=${encodeURIComponent(tournament.slug)}`;
  }
  return base;
}

export function tournamentPayHref(tournament: TournamentLinkFields): string {
  const base = safeInternalLink(tournament.pay_url, "/pay");
  if (base === "/pay") {
    return `/pay?tournament=${encodeURIComponent(tournament.slug)}`;
  }
  return base;
}
