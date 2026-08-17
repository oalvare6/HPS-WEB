import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Ctx = { params: Promise<{ id: string }> };

/** Sentinel order unlikely to collide with real display_order values. */
const TEMP_ORDER = -2_000_000;

export async function PATCH(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const { direction, swap_with } = (await request.json()) as {
    direction?: "up" | "down";
    swap_with?: string;
  };
  if (direction !== "up" && direction !== "down") {
    return NextResponse.json({ error: "Invalid direction." }, { status: 400 });
  }

  const { data: rows, error: listErr } = await supabaseAdmin
    .from("tournaments")
    .select("id, display_order, start_date")
    .order("display_order", { ascending: true })
    .order("start_date", { ascending: true });

  if (listErr || !rows) {
    return NextResponse.json({ error: listErr?.message ?? "Failed to load tournaments." }, { status: 500 });
  }

  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  /*
    The admin list shows tournaments and open-play nights as separate
    sections, so "move up" must swap with the neighbor IN THAT SECTION —
    the client names it via `swap_with`. Without it (older callers), fall
    back to the adjacent row in the one global display_order sequence.
    Pressing "down" on the last tournament used to silently swap it with the
    first open-play night in the other table.
  */
  let swapIdx: number;
  if (typeof swap_with === "string" && swap_with.length > 0) {
    swapIdx = rows.findIndex((r) => r.id === swap_with);
    if (swapIdx === -1) {
      return NextResponse.json({ error: "Swap target not found." }, { status: 404 });
    }
  } else {
    swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rows.length) {
      return NextResponse.json({ ok: true, noop: true });
    }
  }

  const a = rows[idx];
  const b = rows[swapIdx];

  const origA = a.display_order ?? idx;
  const origB = b.display_order ?? swapIdx;
  const newA = origB === origA ? origA + (direction === "up" ? -1 : 1) : origB;
  const newB = origA === origB ? origB + (direction === "up" ? 1 : -1) : origA;

  const { error: err1 } = await supabaseAdmin
    .from("tournaments")
    .update({ display_order: TEMP_ORDER })
    .eq("id", a.id);
  if (err1) return NextResponse.json({ error: err1.message }, { status: 500 });

  const { error: err2 } = await supabaseAdmin
    .from("tournaments")
    .update({ display_order: newB })
    .eq("id", b.id);
  if (err2) {
    await supabaseAdmin.from("tournaments").update({ display_order: origA }).eq("id", a.id);
    return NextResponse.json({ error: err2.message }, { status: 500 });
  }

  const { error: err3 } = await supabaseAdmin
    .from("tournaments")
    .update({ display_order: newA })
    .eq("id", a.id);
  if (err3) {
    await supabaseAdmin.from("tournaments").update({ display_order: origB }).eq("id", b.id);
    await supabaseAdmin.from("tournaments").update({ display_order: origA }).eq("id", a.id);
    return NextResponse.json({ error: err3.message }, { status: 500 });
  }

  revalidatePath("/events");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
