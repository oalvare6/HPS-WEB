import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  LEAGUE_OVERRIDE_CACHE_TAG,
  LEAGUE_ROUND_STATUSES,
  type LeagueRoundStatus,
} from "@/lib/league-schedule-overrides";
import { SPRING_2026_LEAGUE_ROUNDS } from "@/lib/spring-2026-league-schedule";

const KNOWN_DATE_KEYS = new Set(SPRING_2026_LEAGUE_ROUNDS.map((r) => r.dateKey));
const STATUS_SET = new Set<string>(LEAGUE_ROUND_STATUSES);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { data, error } = await supabaseAdmin
    .from("league_round_overrides")
    .select("date_key, status, note, rescheduled_to, updated_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ overrides: data ?? [] });
}

export async function PUT(request: Request) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  }

  const { date_key, status, note, rescheduled_to } = body as {
    date_key?: unknown;
    status?: unknown;
    note?: unknown;
    rescheduled_to?: unknown;
  };

  if (typeof date_key !== "string" || !KNOWN_DATE_KEYS.has(date_key)) {
    return NextResponse.json({ error: "Unknown date_key." }, { status: 400 });
  }
  if (typeof status !== "string" || !STATUS_SET.has(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const cleanNote =
    typeof note === "string" && note.trim().length > 0 ? note.trim().slice(0, 280) : null;

  let cleanRescheduled: string | null = null;
  if (rescheduled_to != null && rescheduled_to !== "") {
    if (typeof rescheduled_to !== "string" || !ISO_DATE.test(rescheduled_to)) {
      return NextResponse.json(
        { error: "rescheduled_to must be a YYYY-MM-DD date string." },
        { status: 400 }
      );
    }
    cleanRescheduled = rescheduled_to;
  }

  if (status === "scheduled" && !cleanNote && !cleanRescheduled) {
    // No-op override: delete the row instead so the UI shows a clean default.
    const { error: delErr } = await supabaseAdmin
      .from("league_round_overrides")
      .delete()
      .eq("date_key", date_key);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    revalidateTag(LEAGUE_OVERRIDE_CACHE_TAG);
    return NextResponse.json({ ok: true, deleted: true });
  }

  const { error } = await supabaseAdmin.from("league_round_overrides").upsert(
    {
      date_key,
      status: status as LeagueRoundStatus,
      note: cleanNote,
      rescheduled_to: cleanRescheduled,
    },
    { onConflict: "date_key" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag(LEAGUE_OVERRIDE_CACHE_TAG);
  return NextResponse.json({ ok: true });
}
