/**
 * Build `/pay` URLs for registration resume (registrationId + payToken).
 * Including `tournament` slug keeps cancel-back and bookmarks on the right event.
 */
export function buildPayResumePath(params: {
  registrationId: string;
  payToken: string;
  tournamentSlug?: string | null;
  cancelled?: boolean;
}): string {
  const query = new URLSearchParams();
  if (params.tournamentSlug) {
    query.set("tournament", params.tournamentSlug);
  }
  query.set("registrationId", params.registrationId);
  query.set("payToken", params.payToken);
  if (params.cancelled) {
    query.set("cancelled", "true");
  }
  return `/pay?${query.toString()}`;
}

export function buildPayResumeUrl(
  baseUrl: string,
  params: Parameters<typeof buildPayResumePath>[0]
): string {
  const origin = baseUrl.replace(/\/$/, "");
  return `${origin}${buildPayResumePath(params)}`;
}

/**
 * The in-app waiver link. Defined next to the pay link on purpose: it carries
 * the *same* HMAC pay-resume token, because the waiver step and the payment
 * step are two screens of one registration and there is no reason for them to
 * have separate token schemes to keep in sync.
 */
export function buildWaiverSignPath(params: {
  registrationId: string;
  payToken: string;
  tournamentSlug?: string | null;
}): string {
  const query = new URLSearchParams();
  query.set("payToken", params.payToken);
  if (params.tournamentSlug) {
    query.set("tournament", params.tournamentSlug);
  }
  return `/register/waiver/${params.registrationId}?${query.toString()}`;
}
