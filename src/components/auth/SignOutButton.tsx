"use client";

import { useRef, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

/**
 * Sign out, everywhere it is offered.
 *
 * A plain `<form action="/auth/signout" method="post">` is the load-bearing
 * half: the server route clears the httpOnly session cookies and is the only
 * thing that can. This component adds the half a form cannot do — clearing the
 * *browser* client's cached session, which lives in localStorage and is what
 * client components read. Without it, `supabase-browser`'s singleton keeps
 * handing out a stale session for the rest of the tab's life even though the
 * server has signed you out.
 *
 * Order matters. The local clear runs first and the form submits after, so a
 * failure in the local clear cannot swallow the server sign-out — the form
 * always goes.
 */
export function SignOutButton({
  className,
  iconSize = 14,
  inMenu = false,
  onSubmitted,
}: {
  className?: string;
  iconSize?: number;
  /**
   * Inside a `role="menu"` container. Sets the ARIA roles a menu needs — and
   * omits them elsewhere, because a stray `menuitem` outside a menu is worse
   * for a screen reader than a plain button (`/me` renders this standalone).
   */
  inMenu?: boolean;
  /** Lets a parent close its menu as the navigation starts. */
  onSubmitted?: () => void;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    // Without this the form navigates immediately and the local clear never
    // finishes. We re-submit below once it has.
    e.preventDefault();
    if (pending) return;
    setPending(true);

    try {
      await createSupabaseBrowserClient().auth.signOut({ scope: "local" });
    } catch {
      // Never block the real sign-out on the local cache. The server route
      // clears the cookies that actually authenticate the next request.
    }

    onSubmitted?.();
    formRef.current?.submit(); // native submit — skips this handler
  };

  return (
    <form
      ref={formRef}
      action="/auth/signout"
      method="post"
      onSubmit={handleSubmit}
      role={inMenu ? "none" : undefined}
    >
      <button
        type="submit"
        role={inMenu ? "menuitem" : undefined}
        disabled={pending}
        className={className}
      >
        {pending ? (
          <Loader2 size={iconSize} className="animate-spin" />
        ) : (
          <LogOut size={iconSize} />
        )}
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </form>
  );
}
