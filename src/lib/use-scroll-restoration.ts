"use client";

import { useEffect } from "react";

/**
 * Persist and restore window scroll position across navigations to and from
 * an admin list page (Phase 4).
 *
 * Next.js 15's App Router already restores scroll for true browser
 * back/forward navigation, but it does not help when:
 *  - The list page navigates to a detail page via router.push (forward nav
 *    resets to top, which is desired) and the user then hits the browser
 *    back button — in which case App Router does restore, but only if the
 *    list page has not been unmounted/remounted. When admin list components
 *    refetch on mount they sometimes end up scrolled to the top before the
 *    browser has a chance to restore.
 *  - The user navigates back via an in-app Link rather than the browser back
 *    button.
 *
 * This hook plugs both gaps using sessionStorage keyed by a caller-provided
 * label. It is intentionally minimal: opt-in per page, no global side effects.
 */
export function useScrollRestoration(storageKey: string): void {
  useEffect(() => {
    const key = `admin-scroll:${storageKey}`;

    const raw = sessionStorage.getItem(key);
    if (raw !== null) {
      const y = Number.parseInt(raw, 10);
      if (Number.isFinite(y) && y > 0) {
        // Defer to next frame so the page has time to render content tall
        // enough to actually accept the scroll position.
        const id = window.requestAnimationFrame(() => {
          window.scrollTo({ top: y, behavior: "auto" });
        });
        // If content is loaded asynchronously, a second tick a moment later
        // usually catches the case where the list grew after first paint.
        const timeout = window.setTimeout(() => {
          window.scrollTo({ top: y, behavior: "auto" });
        }, 150);

        const persistAndCleanup = () => {
          window.cancelAnimationFrame(id);
          window.clearTimeout(timeout);
        };

        const persist = () => {
          sessionStorage.setItem(key, String(window.scrollY));
        };

        window.addEventListener("pagehide", persist);

        return () => {
          persistAndCleanup();
          persist();
          window.removeEventListener("pagehide", persist);
        };
      }
    }

    const persist = () => {
      sessionStorage.setItem(key, String(window.scrollY));
    };

    window.addEventListener("pagehide", persist);

    return () => {
      persist();
      window.removeEventListener("pagehide", persist);
    };
  }, [storageKey]);
}
