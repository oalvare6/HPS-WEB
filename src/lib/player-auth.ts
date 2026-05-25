import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeEmail } from "@/lib/contacts";
import type { Contact } from "@/lib/types";

/**
 * Player session + canonical contact row, resolved server-side.
 *
 * `user` is the Supabase auth user. `contact` is the matching `contacts`
 * row, joined by email (citext, so case-insensitive). If no contact row
 * exists yet for this email, we lazily insert a minimal one so player-facing
 * pages always have a row to render and to PATCH against.
 */
export type CurrentPlayer = {
  userId: string;
  email: string;
  contact: Contact;
};

/**
 * Validate the current Supabase Auth session against the server and return
 * the underlying `User` (or `null`).
 *
 * Wrapped in React's `cache()` so multiple Server Components in a single
 * request — e.g. the global header AND the page itself both wanting to
 * know whether someone is signed in — share one Supabase round-trip.
 *
 * NEVER swap this for `getSession()`. `getSession()` reads the cookie
 * without re-validating it; `getUser()` re-validates the JWT against
 * Supabase Auth and is the only correct gate for server rendering.
 */
export const getCurrentAuthUser = cache(async (): Promise<User | null> => {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch (err) {
    // Next.js throws an internal bailout error (`DYNAMIC_SERVER_USAGE`) when
    // `cookies()` is called during static generation. That signal MUST
    // propagate so Next can mark the page as dynamic. Catching it here both
    // pollutes the build log and risks miscategorising the route as static.
    if (isNextDynamicBailout(err)) throw err;
    console.error("[player-auth] getCurrentAuthUser failed:", err);
    return null;
  }
});

function isNextDynamicBailout(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return (
    digest.startsWith("DYNAMIC_SERVER_USAGE") ||
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_NOT_FOUND")
  );
}

/**
 * Resolve the currently logged-in player. Returns `null` when there is no
 * valid Supabase session, or when something is so wrong server-side that we
 * cannot produce a contact row.
 *
 * Wrapped in React's `cache()` so it dedupes per request (see
 * `getCurrentAuthUser` above for the underlying auth call). Multiple
 * `getCurrentPlayer()` calls in the same render path collapse to a single
 * Supabase auth round-trip + at most one contact lookup.
 */
export const getCurrentPlayer = cache(async (): Promise<CurrentPlayer | null> => {
  const user = await getCurrentAuthUser();
  if (!user) return null;
  const email = normalizeEmail(user.email ?? "");
  if (!email) return null;

  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (lookupErr) {
    console.error("[player-auth] contact lookup failed:", lookupErr.message);
    return null;
  }

  if (existing) {
    return { userId: user.id, email, contact: existing as Contact };
  }

  // Name extraction handles the metadata shapes our auth surfaces deliver:
  //   - magic link / password registration: first_name, last_name, full_name
  //   - Google OAuth: given_name, family_name, full_name (and `name` as alias)
  //   - Apple OAuth: name (single string, only on the very first authorization
  //     — Apple does NOT resend it on subsequent sign-ins, by design)
  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    first_name?: string;
    given_name?: string;
    last_name?: string;
    family_name?: string;
  };
  const first = (meta.first_name ?? meta.given_name ?? "").trim();
  const last = (meta.last_name ?? meta.family_name ?? "").trim();
  const composite = (meta.full_name ?? meta.name ?? "").trim();
  const [fallbackFirst, ...fallbackRest] = composite.split(/\s+/).filter(Boolean);

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("contacts")
    .insert({
      first_name: first || fallbackFirst || "",
      last_name: last || fallbackRest.join(" ") || "",
      email,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    console.error(
      "[player-auth] failed to create contact for new player:",
      insertErr?.message
    );
    return null;
  }

  return { userId: user.id, email, contact: inserted as Contact };
});

/**
 * Does the given email already have an `auth.users` row? Used by the
 * post-checkout claim flow to decide between offering a "Claim your
 * account" magic-link card vs. nudging the player to sign in.
 *
 * Implementation note: GoTrue's admin API doesn't expose a typed
 * `getUserByEmail` in supabase-js. We page through `listUsers` (capped at
 * 1000 per page) and filter in JS. For HPS launch scale this is a single
 * round-trip; revisit when the user count climbs.
 *
 * Failures (missing service-role key, network blip, GoTrue downtime)
 * return `false`. The downstream UX of showing the claim card to a user
 * who actually has an account is harmless: `signInWithOtp` on an existing
 * user simply sends a normal magic link.
 */
export async function hasAuthUserForEmail(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) {
      console.error(
        "[player-auth] hasAuthUserForEmail listUsers failed:",
        error.message
      );
      return false;
    }
    return data.users.some(
      (u) => normalizeEmail(u.email ?? "") === normalized
    );
  } catch (err) {
    console.error("[player-auth] hasAuthUserForEmail threw:", err);
    return false;
  }
}

export type PlayerRegistrationRow = {
  id: string;
  created_at: string;
  tournament_id: string | null;
  tournament_title: string | null;
  tournament_slug: string | null;
  tournament_status: string | null;
  registration_type: "adult" | "youth";
  payment_status: string;
  payment_amount: number | null;
  docuseal_status: string;
};

export type PlayerPaymentRow = {
  id: string;
  created_at: string;
  amount: number;
  currency: string;
  status: string;
  tournament_id: string | null;
  tournament_title: string | null;
  tournament_name: string | null;
};

export type PlayerProfileData = {
  registrations: PlayerRegistrationRow[];
  payments: PlayerPaymentRow[];
};

/**
 * Fetch the player's registration and payment history. Uses the admin
 * client because the player-facing pages don't need RLS-scoped queries —
 * they're gated server-side via `getCurrentPlayer`. This keeps us
 * independent of whether RLS is fully written for player reads yet.
 */
export async function getPlayerProfileData(
  contactId: string
): Promise<PlayerProfileData> {
  const [regsRes, paysRes] = await Promise.all([
    supabaseAdmin
      .from("registrations")
      .select(
        `id, created_at, tournament_id, registration_type, payment_status,
         payment_amount, docuseal_status,
         tournament:tournaments ( id, title, slug, status )`
      )
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("payments")
      .select(
        `id, created_at, amount, currency, status, tournament_id, tournament_name,
         tournament:tournaments ( id, title )`
      )
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false }),
  ]);

  type RegRowRaw = {
    id: string;
    created_at: string;
    tournament_id: string | null;
    registration_type: "adult" | "youth";
    payment_status: string;
    payment_amount: number | null;
    docuseal_status: string;
    tournament: {
      id: string;
      title: string;
      slug: string;
      status: string;
    } | null;
  };
  type PayRowRaw = {
    id: string;
    created_at: string;
    amount: number;
    currency: string;
    status: string;
    tournament_id: string | null;
    tournament_name: string | null;
    tournament: { id: string; title: string } | null;
  };

  const registrations: PlayerRegistrationRow[] =
    ((regsRes.data ?? []) as unknown as RegRowRaw[]).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      tournament_id: r.tournament_id,
      tournament_title: r.tournament?.title ?? null,
      tournament_slug: r.tournament?.slug ?? null,
      tournament_status: r.tournament?.status ?? null,
      registration_type: r.registration_type,
      payment_status: r.payment_status,
      payment_amount: r.payment_amount,
      docuseal_status: r.docuseal_status,
    }));

  const payments: PlayerPaymentRow[] =
    ((paysRes.data ?? []) as unknown as PayRowRaw[]).map((p) => ({
      id: p.id,
      created_at: p.created_at,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      tournament_id: p.tournament_id,
      tournament_title: p.tournament?.title ?? null,
      tournament_name: p.tournament_name,
    }));

  return { registrations, payments };
}
