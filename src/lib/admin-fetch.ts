"use client";

/**
 * One fetch wrapper for admin screens.
 *
 * The thing it exists for: an expired admin cookie used to reload the page
 * (discarding whatever the owner had typed) or surface as a toast reading
 * exactly "Unauthorized". Now every 401 becomes one plain sentence and the
 * caller keeps its form state, so a result typed at 9:50 PM on a Friday is not
 * lost to a session that quietly ran out at 9:49.
 */

export type AdminFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number; expired: boolean };

export const LOGIN_EXPIRED_MESSAGE =
  "Your login expired. Sign in again in a new tab, then press Save again.";

export async function adminFetch<T>(
  input: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<AdminFetchResult<T>> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers ?? {});
  let body = rest.body;
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }
  try {
    const res = await fetch(input, { ...rest, headers, body, cache: "no-store" });
    if (res.status === 401) {
      return { ok: false, error: LOGIN_EXPIRED_MESSAGE, status: 401, expired: true };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        parsed && typeof parsed === "object" && "error" in parsed &&
        typeof (parsed as { error: unknown }).error === "string"
          ? (parsed as { error: string }).error
          : "Something went wrong. Try again.";
      return { ok: false, error: message, status: res.status, expired: false };
    }
    return { ok: true, data: parsed as T };
  } catch {
    return {
      ok: false,
      error: "Could not reach the server. Check the connection and try again.",
      status: 0,
      expired: false,
    };
  }
}
