import { redirect } from "next/navigation";
import { Section, SectionHeader } from "@/components/shared/section";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LoginTabs } from "./LoginTabs";
import { MagicLinkForm } from "./MagicLinkForm";
import { OAuthButtons } from "./OAuthButtons";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  next?: string;
  error?: string;
  error_description?: string;
  tab?: string;
}>;

const ERROR_MESSAGES: Record<string, string> = {
  missing_code:
    "That sign-in link was missing its verification code. Request a new link below.",
  exchange_failed:
    "That sign-in link is no longer valid. Please request a new one below.",
  recovery_expired:
    "That password-reset link has expired or was already used. Request a fresh one below.",
  oauth_failed:
    "We couldn't finish signing you in with that provider. Please try again.",
};

const SAFE_DESCRIPTION_MAX = 200;

/**
 * Player passwordless sign-in. Sends a magic link via Supabase Auth. Admin
 * login is a separate flow at `/admin` and is unaffected.
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
    tab,
  } = await searchParams;
  const nextPath = sanitizeNextPath(next);
  const baseMessage = errorCode ? ERROR_MESSAGES[errorCode] ?? null : null;
  const safeDescription = sanitizeDescription(errorDescriptionRaw);
  const errorMessage =
    baseMessage && safeDescription
      ? `${baseMessage} (${safeDescription})`
      : baseMessage;
  const defaultTab: "magic" | "password" = tab === "password" ? "password" : "magic";

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
            Enter your email and we&apos;ll send you a one-tap sign-in link. No
            password to remember.
          </p>
        </div>
      </section>

      <Section dark className="bg-surface">
        <div className="max-w-md mx-auto">
          <SectionHeader
            title="Player sign-in"
            subtitle="Use the same email you registered with so we can find your profile and waiver."
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

          <div
            className="my-6 flex items-center gap-3 text-xs text-zinc-500"
            aria-hidden="true"
          >
            <div className="h-px bg-border-token flex-1" />
            <span className="uppercase tracking-wider">
              or continue with email
            </span>
            <div className="h-px bg-border-token flex-1" />
          </div>

          <LoginTabs
            defaultTab={defaultTab}
            magicLink={<MagicLinkForm nextPath={nextPath} />}
            password={<PasswordForm nextPath={nextPath} />}
          />
          <p className="mt-8 text-sm text-zinc-500 text-center">
            New here?{" "}
            <a href="/register" className="text-brand hover:underline">
              Register for a tournament
            </a>{" "}
            and your account will be created automatically the first time you
            sign in.
          </p>
        </div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}

/**
 * Allow only relative same-origin paths to flow into the magic-link
 * redirect. Blocks open-redirect bait like `?next=https://evil.example/`.
 */
function sanitizeNextPath(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

/**
 * Trim and length-cap a provider-supplied error description before showing
 * it. We trust providers to send short, human-readable messages, but we
 * never let attacker-controlled query strings exceed a reasonable length
 * or leak HTML into the UI (React already escapes; the cap is belt-and-
 * suspenders on UX, not security).
 */
function sanitizeDescription(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > SAFE_DESCRIPTION_MAX
    ? trimmed.slice(0, SAFE_DESCRIPTION_MAX) + "…"
    : trimmed;
}
