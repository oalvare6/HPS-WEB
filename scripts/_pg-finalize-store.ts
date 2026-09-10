/**
 * A `FinalizeStore` backed by a REAL PostgreSQL (Stage 1.4).
 *
 * `scripts/_test-fakes.ts` has an `InMemoryFinalizeStore` that imitates the SQL.
 * This one does not imitate anything: every read is the query
 * `SupabaseFinalizeStore` issues, and `finalize`/`recordEvent` call the actual
 * database functions from
 * `supabase/migrations/20260909120100_stripe_payment_finalization.sql`.
 *
 * It is deliberately written to mirror `src/lib/payment-finalize-store-supabase.ts`
 * statement for statement — same columns, same filters, same ordering, same
 * "newest live registration for this email on this event" rule — so that a
 * divergence between the two is a bug in one of them, not in the test.
 *
 * Two things it reproduces on purpose:
 *   * the functions are called by NAMED parameter (`p =>`, `p_event_id =>` …),
 *     which is how PostgREST invokes them for `supabaseAdmin.rpc(fn, { p: … })`.
 *     Rename a parameter in the migration and this fails, exactly as production
 *     would;
 *   * a database error is thrown, not swallowed, so the caller's "infrastructure
 *     failure must not be acknowledged" branch is reached for real.
 */
import type {
  CheckoutAttemptRow,
  FinalizeArgs,
  FinalizeDropInRow,
  FinalizeRegistrationRow,
  FinalizeRpcResult,
  FinalizeStore,
} from "../src/lib/payment-finalize";
import type { PricedTournament } from "../src/lib/stripe-checkout";
import { jsonLit, lit, type PgDb } from "./_pg";

const REGISTRATION_SELECT = "id, email, tournament_id, contact_id, payment_status, cancelled_at";

export class PgFinalizeStore implements FinalizeStore {
  /** Every call, in order — so a test can prove a dry run wrote nothing. */
  calls: string[] = [];
  /** Set to make the next `finalize` throw, simulating an infrastructure fault. */
  failNextFinalize = false;

  constructor(private db: PgDb) {}

  async loadRegistration(id: string): Promise<FinalizeRegistrationRow | null> {
    this.calls.push(`loadRegistration:${id}`);
    return this.db.row<FinalizeRegistrationRow>(
      `select ${REGISTRATION_SELECT} from public.registrations where id = ${lit(id)}`
    );
  }

  async findRegistrationByEmail(email: string, tournamentId: string): Promise<FinalizeRegistrationRow | null> {
    this.calls.push(`findRegistrationByEmail:${email}`);
    return this.db.row<FinalizeRegistrationRow>(
      `select ${REGISTRATION_SELECT} from public.registrations
        where email = ${lit(email)}
          and tournament_id = ${lit(tournamentId)}
          and cancelled_at is null
        order by created_at desc
        limit 1`
    );
  }

  async loadTournament(id: string): Promise<PricedTournament | null> {
    this.calls.push(`loadTournament:${id}`);
    return this.db.row<PricedTournament>(
      `select id, title, slug, entry_fee_cents, drop_in_fee_cents
         from public.tournaments where id = ${lit(id)}`
    );
  }

  async loadCheckoutAttempt(sessionId: string): Promise<CheckoutAttemptRow | null> {
    this.calls.push(`loadCheckoutAttempt:${sessionId}`);
    return this.db.row<CheckoutAttemptRow>(
      `select stripe_session_id, amount_cents, currency, registration_id, drop_in_id, tournament_id
         from public.stripe_checkout_attempts where stripe_session_id = ${lit(sessionId)}`
    );
  }

  async loadDropIn(id: string): Promise<FinalizeDropInRow | null> {
    this.calls.push(`loadDropIn:${id}`);
    return this.db.row<FinalizeDropInRow>(
      `select id, amount_cents, tournament_id, contact_id, payment_status
         from public.drop_ins where id = ${lit(id)}`
    );
  }

  async ensureContactByEmail(email: string): Promise<string | null> {
    this.calls.push(`ensureContactByEmail:${email}`);
    // The production store goes through upsertContactByEmail. The shape that
    // matters to settlement is "returns a contact id or null, and a failure here
    // must never block the transaction".
    // A CTE, because `row()` wraps its argument in a sub-select and Postgres
    // does not allow a bare INSERT there.
    const row = await this.db.row<{ id: string }>(
      `with upserted as (
         insert into public.contacts (first_name, last_name, email, tags)
         values ('', '', ${lit(email)}, '{paid}')
         on conflict (email) do update set tags = excluded.tags
         returning id
       )
       select id from upserted`
    );
    return row?.id ?? null;
  }

  async finalize(args: FinalizeArgs): Promise<FinalizeRpcResult> {
    this.calls.push(`finalize:${args.session_id}`);
    if (this.failNextFinalize) {
      this.failNextFinalize = false;
      throw new Error("simulated finalize failure");
    }
    // Named parameter: exactly what PostgREST sends for rpc(fn, { p: args }).
    return this.db.json<FinalizeRpcResult>(`public.finalize_checkout_payment(p => ${jsonLit(args)})`);
  }

  async recordEvent(input: {
    eventId: string;
    type: string;
    objectId: string | null;
    outcome: string;
    detail: string | null;
  }): Promise<void> {
    this.calls.push(`recordEvent:${input.eventId}`);
    await this.db.json(
      `public.record_stripe_webhook_event(
         p_event_id  => ${lit(input.eventId)},
         p_type      => ${lit(input.type)},
         p_object_id => ${lit(input.objectId)},
         p_outcome   => ${lit(input.outcome)},
         p_detail    => ${lit(input.detail)}
       )`
    );
  }
}
