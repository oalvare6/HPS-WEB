import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  MAX_RECIPIENTS_PER_SEND,
  isMessageAudience,
  renderMessageBody,
  unknownPlaceholders,
} from "@/lib/admin-messages";
import { resolveForEvent } from "@/lib/admin-messages-server";
import { adminEmailConfigured } from "@/lib/email/message-sender";

/**
 * The dry run. Resolves the audience exactly as the send will, renders the text
 * exactly as the first recipient will receive it, and writes nothing.
 *
 * This exists so the owner approves the real thing rather than an approximation:
 * same query, same `resolveAudience`, same renderer. The only difference between
 * this and POST /messages is that this one does not send.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

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

  if (!isMessageAudience(body.audience)) {
    return NextResponse.json({ error: "Choose who this goes to." }, { status: 400 });
  }
  const teamId =
    typeof body.team_id === "string" && UUID_RE.test(body.team_id) ? body.team_id : null;
  const registrationIds = Array.isArray(body.registration_ids)
    ? body.registration_ids.filter((v): v is string => typeof v === "string" && UUID_RE.test(v))
    : [];

  const event = await supabaseAdmin
    .from("tournaments")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (event.error || !event.data) {
    return NextResponse.json({ error: "That event does not exist." }, { status: 404 });
  }

  const resolved = await resolveForEvent(id, body.audience, { teamId, registrationIds });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 500 });
  }
  const { recipients, skipped } = resolved.resolved;

  const template = typeof body.body === "string" ? body.body : "";
  const first = recipients[0];
  const sample = first
    ? renderMessageBody(template, {
        firstName: first.name.split(" ")[0] || "there",
        name: first.name,
        event: event.data.title as string,
      })
    : renderMessageBody(template, {
        firstName: "there",
        name: "there",
        event: event.data.title as string,
      });

  // Warnings, not refusals. The operator may well mean to leave a bracket in.
  const warnings: string[] = [];
  const unknown = unknownPlaceholders(template);
  if (unknown.length > 0) {
    warnings.push(
      `These will be sent exactly as written, not filled in: ${unknown.join(", ")}`
    );
  }
  if (/\[add |\[write /i.test(template)) {
    warnings.push("The template still contains bracketed placeholder text.");
  }
  if (recipients.length > MAX_RECIPIENTS_PER_SEND) {
    warnings.push(
      `${recipients.length} recipients is more than this admin will send at once (${MAX_RECIPIENTS_PER_SEND}).`
    );
  }
  if (!adminEmailConfigured()) {
    warnings.push(
      "No email provider is configured, so sending will record every recipient as failed and deliver nothing."
    );
  }

  return NextResponse.json({
    event: event.data.title,
    recipients,
    skipped,
    sample,
    warnings,
    providerConfigured: adminEmailConfigured(),
  });
}
