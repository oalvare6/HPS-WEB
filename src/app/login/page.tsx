import { redirect } from "next/navigation";
import { Section, SectionHeader } from "@/components/shared/section";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { MagicLinkForm } from "./MagicLinkForm";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  missing_code:
    "That sign-in link was missing its verification code. Request a new link below.",
  exchange_failed:
    "That sign-in link is no longer valid. Please request a new one below.",
};

/**
 * Player passwordless sign-in. Sends a magic link via Supabase Auth. Admin
 * login is a separate flow at `/admin` and is unaffected.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next, error: errorCode } = await searchParams;
  const nextPath = sanitizeNextPath(next);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] ?? null : null;

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
          <MagicLinkForm nextPath={nextPath} />
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
