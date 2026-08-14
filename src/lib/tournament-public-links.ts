import { safeInternalLink } from "@/lib/safe-internal-link";
import { eventKindCopy, isOpenPlay } from "@/lib/event-kind";
import type { SignupState } from "@/lib/signup-state";
import type { Tournament } from "@/lib/types";

type TournamentLinkFields = {
  slug: string;
  register_url: string | null;
  pay_url: string | null;
};

type TournamentCtaFields = TournamentLinkFields & {
  registration_open: boolean;
  payments_open: boolean;
  /** Optional so hand-built fixtures stay valid; missing resolves to 'tournament'. */
  kind?: Tournament["kind"];
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
      label: `Pay ${eventKindCopy(tournament).feeLabel.toLowerCase()}`,
    };
  }
  return { kind: "none" };
}

/* ------------------------------------------------------------------ */

/**
 * The same CTA, but answered for **this visitor** rather than for the event.
 *
 * `tournamentPrimaryCta` above cannot tell a stranger from somebody who signed
 * up three weeks ago, picked a team and signed a waiver — it reads two boolean
 * flags on the event and nothing else. So the button said "Sign up to play" to
 * a player who was already on the roster, and the only way to discover what was
 * actually left was to click it and read the resulting screen.
 *
 * This is a pure projection of `SignupState` (from `lib/signup-state.ts`) onto
 * a button. It adds **no branch logic of its own** — every decision was already
 * made and tested upstream; all that happens here is choosing words. The
 * signed-out case delegates straight back to `tournamentPrimaryCta`, so a
 * visitor we don't know sees exactly what they saw before.
 */
export type ViewerEventCta = {
  /**
   * `"none"` renders no button at all — used when there is genuinely nothing
   * left to do, which is a different thing from an event that is closed.
   */
  kind: "register" | "pay" | "waiver" | "none";
  href: string | null;
  label: string | null;
  /** Headline above the button. */
  heading: string;
  /** One line under it. Null when the heading says everything. */
  note: string | null;
  /** True when this reflects a known person, so the card can style itself. */
  personalised: boolean;
};

export function viewerEventCta({
  tournament,
  state,
  teamName,
  entryFeeLabel,
  isFinished = false,
}: {
  tournament: TournamentCtaFields;
  /** Null when signed out, or when we have never met this person. */
  state: SignupState | null;
  teamName: string | null;
  entryFeeLabel: string | null;
  /** The event's last day has passed. Outranks everything below. */
  isFinished?: boolean;
}): ViewerEventCta {
  const anonymous = (): ViewerEventCta => {
    const cta = tournamentPrimaryCta(tournament);
    if (cta.kind === "none") {
      return {
        kind: "none",
        href: null,
        label: null,
        heading: "Take part",
        note: null,
        personalised: false,
      };
    }
    return {
      kind: cta.kind === "pay" ? "pay" : "register",
      href: cta.href,
      label: cta.label,
      heading: "Take part",
      note: null,
      personalised: false,
    };
  };

  if (isFinished) {
    return {
      kind: "none",
      href: null,
      label: null,
      heading: "Past event",
      note: null,
      personalised: false,
    };
  }

  if (!state) return anonymous();

  const signupHref = tournamentRegisterHref(tournament);
  // Words only — the kind never decides which branch runs, just what it says.
  const openPlay = isOpenPlay(tournament);
  const feeNoun = eventKindCopy(tournament).feeLabel;

  switch (state.kind) {
    /*
      Every personalised branch points at `/register`, and that is deliberate.
      `/register` is the one front door (REBUILD-PLAN §A6): it re-checks the
      waiver against DocuSeal, mints the signed resume token, and holds the team
      picker. Linking around it — straight to a pay URL, say — would rebuild the
      second door this project spent a session removing.
    */
    case "already_paid":
      return {
        kind: "none",
        href: signupHref,
        label: null,
        heading: "You're all set",
        note: teamName
          ? `You're on the roster, playing for ${teamName}. See you on the field.`
          : openPlay
            ? "You're signed up and paid. See you on the field."
            : "You're on the roster and paid up. See you on the field.",
        personalised: true,
      };

    case "owes_payment":
      if (state.payingCash) {
        return {
          kind: "none",
          href: signupHref,
          label: null,
          heading: openPlay ? "You're on the list" : "You're on the roster",
          note: `${entryFeeLabel ?? (openPlay ? feeNoun : "Your entry fee")} due at the field${
            teamName ? ` — playing for ${teamName}` : ""
          }. Nothing else to do before then.`,
          personalised: true,
        };
      }
      return {
        kind: "pay",
        href: signupHref,
        label: entryFeeLabel
          ? `Pay ${entryFeeLabel} now`
          : `Pay ${feeNoun.toLowerCase()}`,
        heading: openPlay ? "You're on the list" : "You're on the roster",
        note: teamName
          ? `Playing for ${teamName}. Pay now, or bring it to the field.`
          : "Your spot is confirmed. Pay now, or bring it to the field.",
        personalised: true,
      };

    case "needs_waiver":
      return {
        kind: "waiver",
        href: signupHref,
        label: "Sign my waiver",
        heading: "One thing left",
        note: openPlay
          ? "You're signed up, but we don't have your signed waiver yet. It takes about a minute."
          : "You're on the roster, but we don't have your signed waiver yet. It takes about a minute.",
        personalised: true,
      };

    case "quick_join":
      return {
        kind: "register",
        href: signupHref,
        label: "Sign up to play",
        heading: "Welcome back",
        note: openPlay
          ? "Your waiver is already on file — just confirm your spot."
          : "Your waiver is already on file — just pick a team.",
        personalised: true,
      };

    // A known person who is not on this roster and has no valid waiver is, for
    // this button's purposes, a stranger: they need the full sign-up.
    case "full_signup":
    case "closed":
      return anonymous();
  }
}
