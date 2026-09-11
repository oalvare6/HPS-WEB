import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { deliverBatch } from "@/lib/admin-messages-server";
import { adminEmailConfigured } from "@/lib/email/message-sender";

/**
 * Retry the addresses that failed — and only those.
 *
 * `deliverBatch` selects rows whose status is 'queued' or 'failed', and
 * `mark_message_sent` refuses to change a row already marked 'sent'. Between
 * them, somebody who received the message cannot receive it again no matter how
 * many times this is pressed. That is the whole reason retry is a separate
 * endpoint rather than "send it again".
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string; batchId: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, batchId } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(batchId)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  // Scope the batch to this event, so a batch id from elsewhere cannot be
  // re-sent through another event's screen.
  const { data: batch, error } = await supabaseAdmin
    .from("message_batches")
    .select("id, subject, body, tournament_id, tournaments!message_batches_tournament_id_fkey(title)")
    .eq("id", batchId)
    .eq("tournament_id", id)
    .maybeSingle();

  if (error) {
    console.error("[admin-messages] retry lookup failed:", error.message);
    return NextResponse.json({ error: "Could not retry that message." }, { status: 500 });
  }
  if (!batch) {
    return NextResponse.json({ error: "That message is not on this event." }, { status: 404 });
  }

  const row = batch as unknown as {
    subject: string;
    body: string;
    tournaments: { title: string } | null;
  };

  const outcome = await deliverBatch(
    batchId,
    row.tournaments?.title ?? "your event",
    row.subject,
    row.body
  );

  return NextResponse.json({
    batch_id: batchId,
    sent: outcome.sent,
    failed: outcome.failed,
    providerConfigured: !outcome.unconfigured && adminEmailConfigured(),
    message:
      outcome.sent === 0 && outcome.failed === 0
        ? "Nothing to retry — every recipient was already sent."
        : outcome.unconfigured
          ? "Still no email provider configured, so nothing was sent."
          : null,
  });
}
