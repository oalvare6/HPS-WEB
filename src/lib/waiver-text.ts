/**
 * The waiver wording, in one place, with a version stamp.
 *
 * This is the placeholder that runs while the PDF service is being sorted out.
 * It is deliberately not a template with blanks — the text a player reads on
 * screen is the text stored against their signature, and
 * `waiver_signatures.waiver_version` records which wording that was.
 *
 * **Bump `WAIVER_TEXT_VERSION` whenever any clause below changes.** Never edit a
 * clause without bumping it: old rows would then claim their signer agreed to
 * wording that did not exist when they signed, which is the one thing a signed
 * record has to be able to rule out.
 *
 * Not legal advice. Same standing as the pages in docs/REBUILD-PLAN.md §A5 —
 * written from what the site actually does, pending the operator's review.
 */

export const WAIVER_TEXT_VERSION = "2026-08-12.v1";

export const WAIVER_ORG_NAME = "Houston Premier Soccer";

export type WaiverType = "adult" | "youth";

export type WaiverClause = { heading: string; body: string };

const SHARED_CLAUSES: WaiverClause[] = [
  {
    heading: "Assumption of risk",
    body: `Soccer is a physical contact sport. I understand that taking part carries inherent risks, including collisions with other players, the ball, the ground or fixed equipment; slips, trips and falls on natural grass; sprains, strains, fractures, concussion and other head injuries; heat illness; and in rare cases permanent disability or death. I understand these risks cannot be eliminated by ${WAIVER_ORG_NAME}, referees, or any other participant, and I choose to take part anyway.`,
  },
  {
    heading: "Fitness to play",
    body: "I confirm that I am in good enough physical condition to take part, that I am not currently under a medical restriction that would prevent me from playing, and that I will stop playing and tell an organizer if I am injured or feel unwell during an event.",
  },
  {
    heading: "Release of liability",
    body: `To the fullest extent permitted by Texas law, I release ${WAIVER_ORG_NAME}, its owners, staff, referees, volunteers and facility providers from claims for injury, illness, or loss of or damage to property arising out of my participation, except where caused by their gross negligence or willful misconduct. Nothing in this waiver limits any right that cannot be waived under Texas law.`,
  },
  {
    heading: "Medical treatment",
    body: "If I am injured and cannot give consent at the time, I authorize event staff to arrange emergency medical treatment on my behalf. I am responsible for the cost of that treatment and of any transport.",
  },
  {
    heading: "Rules of play",
    body: "I agree to follow the rules of the event and the referees' decisions, to wear appropriate footwear, and to play without slide tackling. I understand I can be removed from an event, without refund, for violent or abusive conduct.",
  },
  {
    heading: "Photography",
    body: `I understand that ${WAIVER_ORG_NAME} may photograph or film events and may use those images to promote the league. If I do not want my image used, I will say so in writing and it will be removed from future material.`,
  },
  {
    heading: "How long this lasts",
    body: "This waiver covers every event I take part in for 365 days from the date I sign it. After that I will be asked to sign again.",
  },
];

const ADULT_CLAUSES: WaiverClause[] = [
  ...SHARED_CLAUSES,
  {
    heading: "Signature",
    body: "I am 18 or older. I have read this waiver in full, I understand it, and I am signing it freely on my own behalf. Typing my full name below has the same effect as signing my name on paper.",
  },
];

const YOUTH_CLAUSES: WaiverClause[] = [
  ...SHARED_CLAUSES,
  {
    heading: "Parent or guardian",
    body: "I am the parent or legal guardian of the player named above, and I have the authority to sign on their behalf. I have explained the risks described here to them in terms they can understand.",
  },
  {
    heading: "Signature",
    body: "I have read this waiver in full, I understand it, and I am signing it freely on behalf of my child. Typing my full name below has the same effect as signing my name on paper.",
  },
];

export function getWaiverClauses(type: WaiverType): WaiverClause[] {
  return type === "youth" ? YOUTH_CLAUSES : ADULT_CLAUSES;
}

export function getWaiverTitle(type: WaiverType): string {
  return type === "youth"
    ? `${WAIVER_ORG_NAME} — Youth Participation Waiver`
    : `${WAIVER_ORG_NAME} — Adult Participation Waiver`;
}

/**
 * Who the typed name is supposed to belong to. An adult signs as themselves; a
 * youth waiver is signed by whoever is responsible for the player, and their
 * name will legitimately differ from the player's — so the name match in
 * `/api/waiver/sign` is only enforced for adults.
 */
export function getSignerLabel(type: WaiverType): string {
  return type === "youth"
    ? "Parent or guardian's full name"
    : "Your full legal name";
}

/**
 * Loose name comparison for the adult self-signature check. Case, extra
 * whitespace, periods and hyphens are all noise; a genuinely different name is
 * not. Deliberately forgiving — a player blocked from signing at the field by a
 * missing middle initial is a worse outcome than a slightly loose match.
 */
export function namesLooselyMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[.\-_']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // "Omar Alvarez" vs "Omar J Alvarez": accept when first and last agree.
  const pa = na.split(" ");
  const pb = nb.split(" ");
  if (pa.length < 2 || pb.length < 2) return false;
  return pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1];
}
