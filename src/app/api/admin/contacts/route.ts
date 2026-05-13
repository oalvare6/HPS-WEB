import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import {
  upsertContactByEmail,
  normalizeEmail,
  normalizePhone,
} from "@/lib/contacts";
import { MAX_CONTACT_NOTES_LENGTH } from "@/lib/types";

const MAX_LIST_LIMIT = 200;

export async function GET(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const tag = (url.searchParams.get("tag") ?? "").trim();
  const limit = Math.min(
    MAX_LIST_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? 100))
  );

  try {
    let query = supabaseAdmin
      .from("contacts")
      .select(
        "id, first_name, last_name, email, phone, dob, notes, tags, marketing_opt_in, created_at, updated_at"
      )
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .limit(limit);

    if (q) {
      const safe = q.replace(/[%_]/g, "\\$&");
      query = query.or(
        `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`
      );
    }
    if (tag) {
      query = query.contains("tags", [tag]);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Admin contacts fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load contacts." },
        { status: 500 }
      );
    }

    return NextResponse.json({ contacts: data ?? [] });
  } catch (err) {
    console.error("Admin contacts error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json()) as Record<string, unknown>;

    const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
    const lastName = typeof body.last_name === "string" ? body.last_name.trim() : "";
    const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
    const phone = normalizePhone(typeof body.phone === "string" ? body.phone : null);
    const dob = typeof body.dob === "string" && body.dob ? body.dob : null;
    const notes =
      typeof body.notes === "string" ? body.notes.slice(0, MAX_CONTACT_NOTES_LENGTH) : null;
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === "string")
      : [];
    const marketingOptIn =
      typeof body.marketing_opt_in === "boolean" ? body.marketing_opt_in : true;

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }
    if (!firstName && !lastName) {
      return NextResponse.json(
        { error: "Provide at least a first or last name." },
        { status: 400 }
      );
    }

    const { contact, loadError } = await upsertContactByEmail({
      first_name: firstName || "Unknown",
      last_name: lastName,
      email,
      phone,
      dob,
      notes,
      tags,
      marketing_opt_in: marketingOptIn,
    });

    if (loadError || !contact) {
      return NextResponse.json(
        { error: loadError ?? "Failed to save contact." },
        { status: 500 }
      );
    }

    return NextResponse.json({ contact }, { status: 201 });
  } catch (err) {
    console.error("Admin contacts POST error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
