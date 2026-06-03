import { safeInternalLink } from "@/lib/safe-internal-link";

type TournamentLinkFields = {
  slug: string;
  register_url: string | null;
  pay_url: string | null;
};

type TournamentCtaFields = TournamentLinkFields & {
  registration_open: boolean;
  payments_open: boolean;
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

export type TournamentPrimaryCta =
  | { kind: "pay"; href: string; label: string }
  | { kind: "register"; href: string; label: string }
  | { kind: "none" };

/**
 * Single CTA per tournament. The pay page itself handles "no waiver yet" by
 * routing the user to `/register`, so when payments are open we always prefer
 * the pay link — it short-circuits to PayForm for already-enrolled players.
 */
export function tournamentPrimaryCta(tournament: TournamentCtaFields): TournamentPrimaryCta {
  if (tournament.payments_open) {
    return {
      kind: "pay",
      href: tournamentPayHref(tournament),
      label: "Pay & Play",
    };
  }
  if (tournament.registration_open) {
    return {
      kind: "register",
      href: tournamentRegisterHref(tournament),
      label: "Sign up",
    };
  }
  return { kind: "none" };
}
