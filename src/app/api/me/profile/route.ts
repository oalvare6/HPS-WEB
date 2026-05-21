import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentPlayer } from "@/lib/player-auth";
import { normalizePhone } from "@/lib/contacts";

const MAX_NAME_LEN = 80;
const MAX_EMERGENCY_LEN = 80;

/**
 * PATCH /api/me/profile
 *
 * Whitelisted fields only: first_name, last_name, phone, dob, emergency_name,
 * emergency_phone. Email is intentionally not editable here (it's the
 * Supabase Auth identity) and waiver fields are never touched.
 */
export async function PATCH(req: NextRequest) {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if ("first_name" in body) {
    if (typeof body.first_name !== "string") {
      return NextResponse.json(
        { error: "first_name must be a string." },
        { status: 400 }
      );
    }
    patch.first_name = body.first_name.trim().slice(0, MAX_NAME_LEN);
  }
  if ("last_name" in body) {
    if (typeof body.last_name !== "string") {
      return NextResponse.json(
        { error: "last_name must be a string." },
        { status: 400 }
      );
    }
    patch.last_name = body.last_name.trim().slice(0, MAX_NAME_LEN);
  }
  if ("phone" in body) {
    patch.phone =
      typeof body.phone === "string" ? normalizePhone(body.phone) : null;
  }
  if ("dob" in body) {
    if (body.dob === null || body.dob === "") {
      patch.dob = null;
    } else if (typeof body.dob === "string" && isIsoDate(body.dob)) {
      patch.dob = body.dob;
    } else {
      return NextResponse.json(
        { error: "dob must be a YYYY-MM-DD date." },
        { status: 400 }
      );
    }
  }
  if ("emergency_name" in body) {
    if (body.emergency_name === null) {
      patch.emergency_name = null;
    } else if (typeof body.emergency_name === "string") {
      const trimmed = body.emergency_name.trim().slice(0, MAX_EMERGENCY_LEN);
      patch.emergency_name = trimmed || null;
    } else {
      return NextResponse.json(
        { error: "emergency_name must be a string." },
        { status: 400 }
      );
    }
  }
  if ("emergency_phone" in body) {
    if (body.emergency_phone === null) {
      patch.emergency_phone = null;
    } else if (typeof body.emergency_phone === "string") {
      patch.emergency_phone = normalizePhone(body.emergency_phone);
    } else {
      return NextResponse.json(
        { error: "emergency_phone must be a string." },
        { status: 400 }
      );
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .update(patch)
    .eq("id", player.contact.id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[me/profile] update failed:", error?.message);
    return NextResponse.json(
      { error: error?.message ?? "Failed to update profile." },
      { status: 500 }
    );
  }

  return NextResponse.json({ contact: data });
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
