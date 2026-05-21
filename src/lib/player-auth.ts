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
 * Resolve the currently logged-in player. Returns `null` when there is no
 * valid Supabase session, or when something is so wrong server-side that we
 * cannot produce a contact row.
 *
 * IMPORTANT: This calls `supabase.auth.getUser()`, which validates the JWT
 * against Supabase Auth (not just reads the cookie). Do not swap to
 * `getSession()` — getSession trusts the cookie blindly and is unsafe for
 * server gating.
 */
export async function getCurrentPlayer(): Promise<CurrentPlayer | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
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

  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    first_name?: string;
    last_name?: string;
  };
  const first = (meta.first_name ?? "").trim();
  const last = (meta.last_name ?? "").trim();
  const fullName = (meta.full_name ?? "").trim();
  const [fallbackFirst, ...fallbackRest] = fullName.split(/\s+/).filter(Boolean);

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
