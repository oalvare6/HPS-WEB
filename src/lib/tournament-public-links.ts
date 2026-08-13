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
 * Single CTA per tournament — and it is the **sign-up** link whenever sign-ups
 * are open, whatever the payment flag says.
 *
 * This used to prefer `/pay` the moment `payments_open` was true, on the theory
 * that the pay page would route people onward. In practice that made the button
 * on every live event page open a bare email box titled "Join this event",
 * which told anyone it did not recognise to go and sign a waiver — on
 * `/register`, a different screen with a different vocabulary for the same act.
 * One event, two front doors, and a loop between them.
 *
 * `/register` now handles every case, including the already-registered player
 * it sends straight to payment, so there is one door and this returns it.
 */
export function tournamentPrimaryCta(tournament: TournamentCtaFields): TournamentPrimaryCta {
  if (tournament.registration_open) {
    return {
      kind: "register",
      href: tournamentRegisterHref(tournament),
      label: "Sign up to play",
    };
  }
  // Sign-ups closed but money still open: the only people this can serve are
  // those already on the roster, and paying is genuinely all that is left.
  if (tournament.payments_open) {
    return {
      kind: "pay",
      href: tournamentPayHref(tournament),
      label: "Pay entry fee",
    };
  }
  return { kind: "none" };
}
