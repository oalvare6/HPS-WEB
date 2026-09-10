import { safeInternalLink } from "@/lib/safe-internal-link";
import { eventKindCopy, isOpenPlay } from "@/lib/event-kind";
import type { SignupState } from "@/lib/signup-state";
import { resolveEventView, type StatefulTournament } from "@/lib/tournament-state";
import type { Tournament } from "@/lib/types";

type TournamentLinkFields = {
  slug: string;
  register_url: string | null;
  pay_url: string | null;
};

/**
 * What a CTA needs: the links, and enough of the row for `resolveEventView`.
 *
 * This used to be the two raw flags. A card then said "Sign up to play" on any
 * event whose `registration_open` was still true — including one that had
 * finished four weeks earlier — and the button led to a "closed" card. The CTA
 * now asks the same resolver every money path gates on, so it cannot advertise
 * a door the checkout will refuse.
 */
export type TournamentCtaFields = TournamentLinkFields &
  StatefulTournament & {
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
 *
 * "Open" here is `resolveEventView`'s answer, not the flag's: a finished,
 * cancelled or draft event returns `none` however its flags were left.
 */
export function tournamentPrimaryCta(
  tournament: TournamentCtaFields,
  now: Date = new Date()
): TournamentPrimaryCta {
  const view = resolveEventView(tournament, now);
  if (view.canRegister) {
    return {
      kind: "register",
      href: tournamentRegisterHref(tournament),
      label: "Sign up to play",
    };
  }
  // Sign-ups closed but money still open: the only people this can serve are
  // those already on the roster, and paying is genuinely all that is left.
  if (view.canPay) {
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
 * up three weeks ago, picked a team and signed a waiver — it reads the event
 * and nothing else. So the button said "Sign up to play" to a player who was
 * already on the roster, and the only way to discover what was actually left
 * was to click it and read the resulting screen.
 *
 * This is a pure projection of `SignupState` (from `lib/signup-state.ts`) onto
 * a button. It adds **no branch logic of its own** about the person — every
 * decision was already made and tested upstream; all that happens here is
 * choosing words. The signed-out case delegates straight back to
 * `tournamentPrimaryCta`, so a visitor we don't know sees exactly what they
 * saw before. The event's own state comes from `resolveEventView`, the same
 * answer every other surface reads, and it outranks the person: a finished or
 * cancelled event sells nothing, whoever is looking.
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
  now = new Date(),
}: {
  tournament: TournamentCtaFields;
  /** Null when signed out, or when we have never met this person. */
  state: SignupState | null;
  teamName: string | null;
  entryFeeLabel: string | null;
  /** Injectable for tests; every surface passes nothing. */
  now?: Date;
}): ViewerEventCta {
  const view = resolveEventView(tournament, now);

  const anonymous = (): ViewerEventCta => {
    const cta = tournamentPrimaryCta(tournament, now);
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

  // The event's state outranks everything below. A player on the roster of a
  // finished event is not "all set" for anything, and one on a cancelled event
  // must not be offered payment.
  if (view.isFinished) {
    return {
      kind: "none",
      href: null,
      label: null,
      heading: "Past event",
      note: null,
      personalised: false,
    };
  }

  if (view.isCancelled) {
    return {
      kind: "none",
      href: null,
      label: null,
      heading: "Cancelled",
      note: "This event has been called off.",
      personalised: false,
    };
  }

  /*
    Neither door open (the owner chose Closed, or the event is a draft): the
    event-only answer, whatever we were told about the person. `/register`
    reaches the same conclusion through `resolveSignupState`, which collapses
    every personal state to `closed` when both gates are shut — so a "Pay $80
    now" button here would lead to a screen saying sign-ups are closed. The
    live callers already pass the collapsed state; this makes the function
    safe for one that does not.
  */
  if (!view.canRegister && !view.canPay) return anonymous();

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
