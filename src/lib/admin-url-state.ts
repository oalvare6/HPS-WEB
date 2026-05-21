"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Admin URL state helpers (Phase 4).
 *
 * These hooks let admin list pages keep their filter UI in sync with the URL
 * so that back/forward navigation, hard reloads, and bookmarks all preserve
 * the same view the admin was looking at.
 *
 * We always use router.replace with scroll: false:
 *  - replace, so a flurry of filter changes does not push N entries onto the
 *    history stack (clicking back from a list page should return the user to
 *    the previous page, not to the same list with a slightly different
 *    filter).
 *  - scroll: false, so changing a filter never yanks the user back to the
 *    top of the page.
 */

function buildHref(
  pathname: string,
  next: URLSearchParams,
): string {
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Read + write a single URL search param. Other params are preserved.
 *
 * Passing `null` or `""` to the setter removes the key entirely (so the URL
 * stays clean when filters are at their default).
 */
export function useQueryParam(
  key: string,
  defaultValue = "",
): [string, (value: string | null) => void] {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === null || next === "") {
        params.delete(key);
      } else {
        params.set(key, next);
      }
      router.replace(buildHref(pathname, params), { scroll: false });
    },
    [router, pathname, searchParams, key],
  );

  return [value, setValue];
}

/**
 * Update several URL search params at once. Useful when a single user action
 * changes more than one piece of filter state (e.g. resetting a search clears
 * both `q` and `tag`).
 */
export function useQueryParamsSetter(): (
  patch: Record<string, string | null>,
) => void {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  return useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") params.delete(k);
        else params.set(k, v);
      }
      router.replace(buildHref(pathname, params), { scroll: false });
    },
    [router, pathname, searchParams],
  );
}
