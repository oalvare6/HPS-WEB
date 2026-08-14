import Link from "next/link";
import { redirect } from "next/navigation";
import { Section, SectionHeader } from "@/components/shared/section";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  next?: string;
  error?: string;
  error_description?: string;
}>;

const ERROR_MESSAGES: Record<string, string> = {
  missing_code:
    "That sign-in didn't complete — it was missing its verification code. Please try again.",
  exchange_failed: "That sign-in link is no longer valid. Please try again.",
  oauth_failed:
    "We couldn't finish signing you in with that provider. Please try again.",
};

const SAFE_DESCRIPTION_MAX = 200;

/**
 * Player sign-in: Google only (D5, narrowed 2026-08-14).
 *
 * Magic link and password sign-in were removed here. They served two active
 * users between them (REBUILD-PLAN §2: 28 accounts, 5 ever signed in, 2 within
 * 60 days) while costing four pages, an SMTP dependency and a password-reset
 * flow to keep working. Apple went the same way: never configured, so it
 * failed every time it was tapped.
 *
 * The thing to understand before touching this page: **signing in is not
 * required to play.** Registration and payment both work signed-out, so a
 * player who cannot use Google is never blocked from an event — they just
 * don't get the one-tap returning-player path. That is what makes it safe for
 * this page to offer a single button.
 *
 * Admin login is a separate flow at `/admin` and is unaffected.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const {
    next,
    error: errorCode,
    error_description: errorDescriptionRaw,
  } = await searchParams;

  const nextPath = sanitizeNextPath(next);
  const baseMessage = errorCode ? ERROR_MESSAGES[errorCode] ?? null : null;
  const safeDescription = sanitizeDescription(errorDescriptionRaw);
  const errorMessage =
    baseMessage && safeDescription
      ? `${baseMessage} (${safeDescription})`
      : baseMessage;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(nextPath ?? "/me");
  }

  return (
    <>
      <section className="bg-base text-white py-16 md:py-24 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Sign in
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            One tap with Google. No password to remember.
          </p>
        </div>
      </section>

      <Section dark className="bg-surface">
        <div className="max-w-md mx-auto">
          <SectionHeader
            title="Player sign-in"
            subtitle="Use the same email you registered with and we'll find your profile and waiver automatically."
            dark
          />
          {errorMessage && (
            <div
              className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          <OAuthButtons nextPath={nextPath} />

          <div className="mt-8 space-y-4 text-sm text-zinc-500">
            <p>
              <span className="text-zinc-300">You don&apos;t need an account to play.</span>{" "}
              Signing in just saves you filling in the form —{" "}
              <Link href="/register" className="text-brand hover:underline">
                sign up for an event
              </Link>{" "}
              without one any time.
            </p>
            <p>
              Signed in with a link or password before? Use Google with that
              same email address and you&apos;ll land in the same account.
            </p>
          </div>
        </div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}

/**
 * Allow only relative same-origin paths to flow into the OAuth redirect.
 * Blocks open-redirect bait like `?next=https://evil.example/`.
 */
function sanitizeNextPath(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

/**
 * Trim and length-cap a provider-supplied error description before showing it.
 * We trust providers to send short, human-readable messages, but we never let
 * attacker-controlled query strings exceed a reasonable length or leak HTML
 * into the UI (React already escapes; the cap is belt-and-suspenders on UX,
 * not security).
 */
function sanitizeDescription(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > SAFE_DESCRIPTION_MAX
    ? trimmed.slice(0, SAFE_DESCRIPTION_MAX) + "…"
    : trimmed;
}
