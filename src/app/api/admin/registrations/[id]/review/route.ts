import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { resolveReview } from "@/lib/admin-review";
import { supabaseReviewStore } from "@/lib/admin-review-server";

/**
 * POST /api/admin/registrations/[id]/review — resolve a review flag.
 *
 * Stage 2.3 D. The only path that ever sets `needs_admin_review` back to
 * false. Body: `{ resolution?: string, acknowledge?: boolean }`.
 *
 * The rule lives in `resolveReview` (src/lib/admin-review.ts): the live check
 * runs again here, server-side, against the rows — a flag is never cleared on
 * the strength of what the browser thought was true a minute ago. If anything
 * is still unsafe the answer is 409 with the list; the owner can send it again
 * with `acknowledge: true` and a note saying what they did, and the note is
 * what gets written. Refusals are sentences the dialog can show as they are.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid registration id." }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // An empty body is a plain "mark reviewed".
  }

  const resolution = typeof body.resolution === "string" ? body.resolution : "";
  const acknowledge = body.acknowledge === true;

  try {
    const result = await resolveReview(supabaseReviewStore, {
      registrationId: id,
      resolution,
      acknowledge,
      now: new Date(),
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code, live: result.live ?? [] },
        { status: result.status }
      );
    }
    return NextResponse.json({ id, review: result.view, line: result.line });
  } catch (err) {
    console.error("[review] resolve failed:", err);
    return NextResponse.json({ error: "Could not resolve this review." }, { status: 500 });
  }
}
