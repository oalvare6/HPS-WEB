import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Lightweight counts used by the admin overview hub badges. Returns zeros if a
 * sub-query fails so the dashboard never blocks on this endpoint.
 */
export async function GET() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  let featuredCount = 0;
  let updatesThisWeek = 0;

  const { count: featuredCountRaw, error: featuredErr } = await supabaseAdmin
    .from("tournaments")
    .select("id", { count: "exact", head: true })
    .eq("is_featured", true);
  if (!featuredErr && featuredCountRaw != null) featuredCount = featuredCountRaw;

  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: updatesCountRaw, error: updatesErr } = await supabaseAdmin
    .from("tournament_updates")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sinceIso);
  if (!updatesErr && updatesCountRaw != null) updatesThisWeek = updatesCountRaw;

  return NextResponse.json({ featuredCount, updatesThisWeek });
}
