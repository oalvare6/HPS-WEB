"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Provider } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type OAuthProvider = Extract<Provider, "google" | "apple">;

/**
 * Google + Apple OAuth entry points for player sign-in.
 *
 * Each button calls `supabase.auth.signInWithOAuth`, which (by default)
 * navigates the browser to the provider URL automatically. Supabase's own
 * `/auth/v1/callback` endpoint then forwards back to our `/auth/callback`
 * route, where the existing PKCE `exchangeCodeForSession` handles the code.
 *
 * Identity merge with magic-link / password users is automatic when
 * "Confirm email" is enforced on the Email provider in Supabase. We never
 * fork identity in app code — see docs/AUTH-CONFIG.md.
 */
export function OAuthButtons({ nextPath }: { nextPath: string | null }) {
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState("");

  const start = async (provider: OAuthProvider) => {
    if (pending) return;
    setError("");
    setPending(provider);
    try {
      const supabase = createSupabaseBrowserClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      if (nextPath) callbackUrl.searchParams.set("next", nextPath);

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl.toString() },
      });
      if (oauthError) {
        setError(
          oauthError.message ||
            `We couldn't start the ${labelFor(provider)} sign-in.`
        );
        setPending(null);
      }
      // On success the browser navigates away; nothing left to do here.
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `We couldn't start the ${labelFor(provider)} sign-in.`
      );
      setPending(null);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => start("google")}
        disabled={pending !== null}
        className="w-full h-12 inline-flex items-center justify-center gap-3 rounded-lg bg-white text-zinc-900 font-medium text-sm border border-zinc-200 hover:bg-zinc-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending === "google" ? (
          <Loader2 size={18} className="animate-spin text-zinc-600" />
        ) : (
          <GoogleIcon />
        )}
        {pending === "google" ? "Redirecting…" : "Continue with Google"}
      </button>

      <button
        type="button"
        onClick={() => start("apple")}
        disabled={pending !== null}
        className="w-full h-12 inline-flex items-center justify-center gap-3 rounded-lg bg-black text-white font-medium text-sm border border-zinc-700 hover:bg-zinc-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending === "apple" ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <AppleIcon />
        )}
        {pending === "apple" ? "Redirecting…" : "Continue with Apple"}
      </button>

      {error && (
        <p className="text-sm text-red-400 text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function labelFor(provider: OAuthProvider): string {
  return provider === "google" ? "Google" : "Apple";
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

function AppleIcon() {
  // Apple monochrome glyph. `currentColor` lets it inherit white-on-black
  // from the surrounding button.
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.46 2.246-1.207 3.062-.79.866-2.07 1.532-3.116 1.45-.13-1.117.45-2.275 1.18-3.05.81-.89 2.18-1.55 3.143-1.462zm4.193 16.09c-.582 1.345-.86 1.946-1.61 3.137-1.05 1.66-2.53 3.726-4.36 3.74-1.63.014-2.05-1.06-4.26-1.05-2.21.013-2.67 1.07-4.31 1.057-1.83-.01-3.23-1.876-4.28-3.535-2.92-4.62-3.22-10.04-1.42-12.93 1.27-2.05 3.28-3.246 5.16-3.246 1.92 0 3.13 1.05 4.72 1.05 1.54 0 2.48-1.05 4.7-1.05 1.68 0 3.46.92 4.74 2.5-4.16 2.276-3.49 8.218.92 10.327z"
      />
    </svg>
  );
}
