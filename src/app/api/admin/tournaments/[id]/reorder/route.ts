import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const { direction } = (await request.json()) as { direction?: "up" | "down" };
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
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const a = rows[idx];
  const b = rows[swapIdx];

  // Ensure distinct display_order values so the swap is meaningful
  const orderA = a.display_order ?? idx;
  const orderB = b.display_order ?? swapIdx;
  const newA = orderB === orderA ? orderA + (direction === "up" ? -1 : 1) : orderB;
  const newB = orderA === orderB ? orderB + (direction === "up" ? 1 : -1) : orderA;

  const { error: errA } = await supabaseAdmin
    .from("tournaments")
    .update({ display_order: newA })
    .eq("id", a.id);
  if (errA) return NextResponse.json({ error: errA.message }, { status: 500 });

  const { error: errB } = await supabaseAdmin
    .from("tournaments")
    .update({ display_order: newB })
    .eq("id", b.id);
  if (errB) return NextResponse.json({ error: errB.message }, { status: 500 });

  revalidatePath("/events");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
