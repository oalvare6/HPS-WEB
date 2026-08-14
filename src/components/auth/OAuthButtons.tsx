"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

/**
 * Google OAuth entry point for player sign-in.
 *
 * **Google is the only provider.** Apple was offered alongside it until
 * 2026-08-14 and was removed: it was never configured in Supabase, so the
 * button had a 100% failure rate for its whole life, and configuring it needs a
 * $99/yr Apple developer account plus a client secret that is a JWT expiring
 * every ~6 months — a recurring outage the owner would have to remember to
 * prevent. A button that cannot work is worse than no button, because the
 * player who taps it concludes the site is broken rather than trying the one
 * that does work.
 *
 * `signInWithOAuth` navigates the browser to Google, which returns to
 * Supabase's own `/auth/v1/callback`, which forwards to our `/auth/callback`
 * route where PKCE `exchangeCodeForSession` finishes the job.
 *
 * ⚠ `redirectTo` must be covered by the Redirect URLs allow-list in the
 * Supabase dashboard. When it is not, Supabase silently substitutes the Site
 * URL instead of erroring — the code lands on an origin that has no matching
 * PKCE verifier, no session is created, and the player is left on a stranger's
 * hostname wondering what happened. See docs/AUTH-CONFIG.md §1.
 *
 * Identity merge with legacy email accounts is automatic when "Confirm email"
 * is enforced on the Email provider. We never fork identity in app code.
 */
export function OAuthButtons({ nextPath }: { nextPath: string | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      if (nextPath) callbackUrl.searchParams.set("next", nextPath);

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl.toString() },
      });
      if (oauthError) {
        setError(oauthError.message || "We couldn't start the Google sign-in.");
        setPending(false);
      }
      // On success the browser navigates away; nothing left to do here.
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't start the Google sign-in."
      );
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void start()}
        disabled={pending}
        className="w-full h-12 inline-flex items-center justify-center gap-3 rounded-lg bg-white text-zinc-900 font-medium text-sm border border-zinc-200 hover:bg-zinc-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? (
          <Loader2 size={18} className="animate-spin text-zinc-600" />
        ) : (
          <GoogleIcon />
        )}
        {pending ? "Redirecting…" : "Continue with Google"}
      </button>

      {error && (
        <p className="text-sm text-red-400 text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleIcon() {
  // Standard Google "G" mark. Per Google brand guidelines, multi-color glyph
  // sits on a light background.
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
