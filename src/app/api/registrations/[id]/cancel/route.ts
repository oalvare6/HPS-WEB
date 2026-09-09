import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyPayResumeToken } from "@/lib/app-signing";
import { getCurrentPlayer } from "@/lib/player-auth";
import { cancelRegistrationById } from "@/lib/registration-cancel-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/registrations/[id]/cancel
 *
 * The way off a roster for a player holding either their own signed
 * registration link or a signed-in session. The resume-link flow has its own
 * route (`/pay/resume/api/cancel`) authorised by the server-side resume
 * session; both call the same `cancelRegistrationById`.
 *
 * It never deletes. Cancelling stamps `cancelled_at` and leaves the row.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id || typeof id !== "string" || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Missing registration id." }, { status: 400 });
  }

  /*
    Two ways in, because sign-in is not required to register. The token is the
    HMAC pay-resume token `/api/register` mints for the person who submitted the
    form; the session path is for a signed-in player whose contact owns the row.

    Authorisation is decided BEFORE the registration is read, so an
    unauthorised caller learns nothing about whether the id exists.
  */
  const token = readToken(request, await safeJson(request));
  const tokenOk = verifyPayResumeToken(id, token);

  let sessionOk = false;
  if (!tokenOk) {
    const player = await getCurrentPlayer();
    if (player) {
      const { data: registration } = await supabaseAdmin
        .from("registrations")
        .select("contact_id")
        .eq("id", id)
        .maybeSingle();
      sessionOk = Boolean(
        registration?.contact_id && player.contact.id === registration.contact_id
      );
    }
  }

  if (!tokenOk && !sessionOk) {
    return NextResponse.json(
      {
        error:
          "We couldn't confirm this is your signup. Sign in, or open the link we sent you.",
      },
      { status: 403 }
    );
  }

  const result = await cancelRegistrationById(id);
  return NextResponse.json(result.body, { status: result.status });
}

/* ------------------------------------------------------------------ */

/** The token may arrive in the query string or the body; accept either. */
function readToken(
  request: NextRequest,
  body: Record<string, unknown> | null
): string | null {
  const fromQuery = request.nextUrl.searchParams.get("token");
  if (fromQuery) return fromQuery;
  const fromBody = body?.payToken ?? body?.token;
  return typeof fromBody === "string" ? fromBody : null;
}

/** A cancel with no body is legitimate — the token can come from the URL. */
async function safeJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
