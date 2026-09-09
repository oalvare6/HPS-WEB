/**
 * Production `ResumeStore`: the tables and functions created by
 * supabase/migrations/20260909120000_registration_resume_access.sql, reached
 * through the service-role client like every other write in this app.
 *
 * Every method throws on a database error rather than returning a guess —
 * the callers translate that into a 500 / neutral response, never into
 * "allowed".
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeEmail } from "@/lib/contacts";
import type { StatefulTournament } from "@/lib/tournament-state";
import {
  RESUME_THROTTLE,
  type ConsumeResult,
  type ResumableRegistration,
  type ResumeStore,
  type StoredSession,
} from "@/lib/resume-access";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Registration rows that still owe the entry fee and are still live. */
const RESUMABLE_PAYMENT_STATUSES = ["pending", "partial"];

type EmbeddedTournament = {
  id: string;
  title: string | null;
  status: StatefulTournament["status"];
  is_draft: boolean;
  registration_open: boolean;
  payments_open: boolean;
  start_date: string | null;
  end_date: string | null;
};

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

export class SupabaseResumeStore implements ResumeStore {
  async recordLinkRequest(input: {
    emailDigest: string;
    ipDigest: string | null;
  }): Promise<{ allowed: boolean; reason?: string }> {
    const { data, error } = await supabaseAdmin.rpc("record_resume_link_request", {
      p_email_digest: input.emailDigest,
      p_ip_digest: input.ipDigest,
      p_email_cooldown_seconds: RESUME_THROTTLE.emailCooldownSeconds,
      p_email_hourly_max: RESUME_THROTTLE.emailHourlyMax,
      p_ip_hourly_max: RESUME_THROTTLE.ipHourlyMax,
    });
    if (error) throw new Error(`record_resume_link_request: ${error.message}`);
    const row = (data ?? {}) as { allowed?: boolean; reason?: string };
    return { allowed: row.allowed === true, reason: row.reason };
  }

  async findResumableRegistration(input: {
    email: string;
    tournamentId: string;
  }): Promise<ResumableRegistration | null> {
    const email = normalizeEmail(input.email);
    if (!email || !UUID_RE.test(input.tournamentId)) return null;

    // Identity resolution mirrors the rest of the app: contact by email
    // (citext), then that contact's live row on this event. The email column
    // on `registrations` is a fallback for legacy rows with no contact link.
    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (contactErr) throw new Error(`contact lookup: ${contactErr.message}`);

    let query = supabaseAdmin
      .from("registrations")
      .select(
        "id, email, contact_id, payment_status, cancelled_at, tournament:tournaments!registrations_tournament_id_fkey ( id, title, status, is_draft, registration_open, payments_open, start_date, end_date )"
      )
      .eq("tournament_id", input.tournamentId)
      .is("cancelled_at", null)
      .in("payment_status", RESUMABLE_PAYMENT_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);

    query = contact?.id ? query.eq("contact_id", contact.id) : query.eq("email", email);

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`registration lookup: ${error.message}`);
    if (!data) return null;

    const tournament = one(data.tournament as EmbeddedTournament | EmbeddedTournament[] | null);
    return {
      id: data.id,
      email: normalizeEmail(data.email ?? email) || email,
      tournamentTitle: tournament?.title ?? null,
      tournament: tournament
        ? {
            status: tournament.status,
            is_draft: tournament.is_draft,
            registration_open: tournament.registration_open,
            payments_open: tournament.payments_open,
            start_date: tournament.start_date,
            end_date: tournament.end_date,
          }
        : null,
    };
  }

  async createAccessToken(input: {
    registrationId: string;
    tokenHash: string;
    purpose: "resume";
    expiresAt: string;
    requesterIpDigest: string | null;
  }): Promise<void> {
    const { error } = await supabaseAdmin.from("registration_access_tokens").insert({
      registration_id: input.registrationId,
      token_hash: input.tokenHash,
      purpose: input.purpose,
      expires_at: input.expiresAt,
      requester_ip_digest: input.requesterIpDigest,
    });
    if (error) throw new Error(`create access token: ${error.message}`);
  }

  async consumeAccessToken(input: {
    tokenHash: string;
    purpose: "resume";
    sessionTokenHash: string;
    scopes: readonly string[];
    sessionTtlSeconds: number;
  }): Promise<ConsumeResult> {
    const { data, error } = await supabaseAdmin.rpc("consume_registration_access_token", {
      p_token_hash: input.tokenHash,
      p_purpose: input.purpose,
      p_session_token_hash: input.sessionTokenHash,
      p_scopes: [...input.scopes],
      p_session_ttl_seconds: input.sessionTtlSeconds,
    });
    if (error) throw new Error(`consume_registration_access_token: ${error.message}`);
    const row = (data ?? {}) as {
      ok?: boolean;
      session_id?: string;
      registration_id?: string;
      expires_at?: string;
    };
    if (row.ok !== true || !row.session_id || !row.registration_id || !row.expires_at) {
      return { ok: false, reason: "invalid" };
    }
    return {
      ok: true,
      sessionId: row.session_id,
      registrationId: row.registration_id,
      expiresAt: row.expires_at,
    };
  }

  async findSession(tokenHash: string): Promise<StoredSession | null> {
    const { data, error } = await supabaseAdmin
      .from("registration_sessions")
      .select("id, registration_id, scopes, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw new Error(`find session: ${error.message}`);
    if (!data) return null;
    return {
      id: data.id,
      registrationId: data.registration_id,
      scopes: Array.isArray(data.scopes) ? (data.scopes as string[]) : [],
      expiresAt: data.expires_at,
      revokedAt: data.revoked_at ?? null,
    };
  }

  async touchSession(sessionId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("registration_sessions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) throw new Error(`touch session: ${error.message}`);
  }

  async revokeSession(sessionId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("registration_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", sessionId)
      .is("revoked_at", null);
    if (error) throw new Error(`revoke session: ${error.message}`);
  }
}

let _store: SupabaseResumeStore | null = null;

export function getResumeStore(): ResumeStore {
  if (!_store) _store = new SupabaseResumeStore();
  return _store;
}
