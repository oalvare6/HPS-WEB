import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateDbError } from "@/lib/admin-db-errors";
import {
  MAX_MESSAGE_BODY,
  MAX_MESSAGE_SUBJECT,
  MAX_RECIPIENTS_PER_SEND,
  isMessageAudience,
  isMessageTemplate,
} from "@/lib/admin-messages";
import { deliverBatch, resolveForEvent } from "@/lib/admin-messages-server";
import { adminEmailConfigured } from "@/lib/email/message-sender";

/**
 * Stage 2.3 item B — send a message, and read what was sent before.
 *
 * The audience is resolved HERE, from the database, not taken from the browser.
 * A list the page happened to be showing may be stale or filtered by a search
 * box; "everyone unpaid" has to mean who is unpaid at the moment of sending.
 * The browser confirms a preview; it does not choose the addresses.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("message_batches")
    .select(
      "id, template, audience, subject, body, created_by, created_at, " +
        "message_recipients(id, registration_id, email, name, status, error, provider_id, attempts, sent_at)"
    )
    .eq("tournament_id", id)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("[admin-messages] history failed:", error.message);
    return NextResponse.json({ error: "Could not load sent messages." }, { status: 500 });
  }

  // Rename the embed to the name the client type uses, so `recipients` means the
  // same thing in the payload as it does in admin-messages.ts.
  const batches = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const { message_recipients, ...rest } = row;
    return { ...rest, recipients: message_recipients ?? [] };
  });

  return NextResponse.json({ batches, providerConfigured: adminEmailConfigured() });
}

export async function POST(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const idempotencyKey =
    typeof body.idempotency_key === "string" ? body.idempotency_key.trim().slice(0, 120) : "";
  if (!idempotencyKey) {
    // Without this a double-tap mails everybody twice, and mail cannot be recalled.
    return NextResponse.json(
      { error: "This send is missing its idempotency key. Reopen the composer and try again." },
      { status: 400 }
    );
  }

  if (!isMessageAudience(body.audience)) {
    return NextResponse.json({ error: "Choose who this goes to." }, { status: 400 });
  }
  const audience = body.audience;

  const subject =
    typeof body.subject === "string" ? body.subject.trim().slice(0, MAX_MESSAGE_SUBJECT) : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, MAX_MESSAGE_BODY) : "";
  if (!subject || !text) {
    return NextResponse.json({ error: "A message needs a subject and a body." }, { status: 400 });
  }

  const createdBy =
    typeof body.created_by === "string" ? body.created_by.trim().slice(0, 120) : "";
  if (!createdBy) {
    return NextResponse.json({ error: "Say who is sending this." }, { status: 400 });
  }

  const teamId = typeof body.team_id === "string" && UUID_RE.test(body.team_id) ? body.team_id : null;
  const registrationIds = Array.isArray(body.registration_ids)
    ? body.registration_ids.filter((v): v is string => typeof v === "string" && UUID_RE.test(v))
    : [];
  if (audience === "team" && !teamId) {
    return NextResponse.json({ error: "Choose a team." }, { status: 400 });
  }
  if (audience === "explicit" && registrationIds.length === 0) {
    return NextResponse.json({ error: "Pick at least one person." }, { status: 400 });
  }

  const event = await supabaseAdmin
    .from("tournaments")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (event.error || !event.data) {
    return NextResponse.json({ error: "That event does not exist." }, { status: 404 });
  }

  const resolved = await resolveForEvent(id, audience, { teamId, registrationIds });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 500 });
  }
  const { recipients, skipped } = resolved.resolved;

  if (recipients.length === 0) {
    return NextResponse.json(
      {
        error:
          skipped.length > 0
            ? "Nobody in that group has an email address on file."
            : "That group has nobody in it.",
      },
      { status: 400 }
    );
  }
  if (recipients.length > MAX_RECIPIENTS_PER_SEND) {
    return NextResponse.json(
      {
        error: `That would message ${recipients.length} people, which is more than this admin will send at once (${MAX_RECIPIENTS_PER_SEND}). Narrow the group.`,
      },
      { status: 400 }
    );
  }

  const { data: batchData, error: batchError } = await supabaseAdmin.rpc(
    "record_message_batch",
    {
      p: {
        idempotency_key: idempotencyKey,
        tournament_id: id,
        template: isMessageTemplate(body.template) ? body.template : null,
        audience,
        team_id: teamId,
        subject,
        body: text,
        created_by: createdBy,
        recipients: recipients.map((r) => ({
          registration_id: r.registrationId,
          contact_id: r.contactId,
          email: r.email,
          name: r.name,
        })),
      },
    }
  );

  if (batchError) {
    console.error("[admin-messages] batch create failed:", batchError.message);
    const { message, status } = translateDbError(batchError, "Could not start that send.");
    return NextResponse.json({ error: message }, { status });
  }

  const batch = (batchData ?? {}) as { batch_id?: string; created?: boolean; queued?: number };
  if (!batch.batch_id) {
    return NextResponse.json({ error: "Could not start that send." }, { status: 500 });
  }

  // The repeat case: this exact send already happened. Report it rather than
  // mailing everybody a second time.
  if (batch.created === false) {
    return NextResponse.json({
      batch_id: batch.batch_id,
      repeated: true,
      sent: 0,
      failed: 0,
      skipped,
      message: "That message was already sent. Nothing was sent again.",
    });
  }

  const outcome = await deliverBatch(batch.batch_id, event.data.title as string, subject, text);

  return NextResponse.json(
    {
      batch_id: batch.batch_id,
      repeated: false,
      sent: outcome.sent,
      failed: outcome.failed,
      skipped,
      providerConfigured: !outcome.unconfigured && adminEmailConfigured(),
      message: outcome.unconfigured
        ? "No email provider is configured, so nothing was sent. Every recipient is recorded as failed; set RESEND_API_KEY and RESUME_EMAIL_FROM, then retry this message."
        : null,
    },
    { status: 201 }
  );
}
