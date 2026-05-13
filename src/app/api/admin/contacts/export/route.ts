import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * CSV export of contacts, optionally scoped to a tournament. Used by the
 * admin for ad-hoc email / SMS campaigns until Phase 3 ships first-party
 * email infrastructure.
 *
 * Query:
 *   tournament_id  - only contacts who registered for this tournament
 *   tag            - only contacts with this tag
 *   marketing      - "true" to require marketing_opt_in
 */
export async function GET(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const tournamentId = url.searchParams.get("tournament_id");
  const tag = url.searchParams.get("tag");
  const marketingOnly = url.searchParams.get("marketing") === "true";

  try {
    let contactIds: string[] | null = null;

    if (tournamentId) {
      if (!UUID_RE.test(tournamentId)) {
        return NextResponse.json(
          { error: "Invalid tournament id." },
          { status: 400 }
        );
      }
      const [regsRes, dropsRes] = await Promise.all([
        supabaseAdmin
          .from("registrations")
          .select("contact_id")
          .eq("tournament_id", tournamentId)
          .not("contact_id", "is", null),
        supabaseAdmin
          .from("drop_ins")
          .select("contact_id")
          .eq("tournament_id", tournamentId),
      ]);
      const ids = new Set<string>();
      for (const row of regsRes.data ?? []) {
        if (row.contact_id) ids.add(row.contact_id as string);
      }
      for (const row of dropsRes.data ?? []) {
        if (row.contact_id) ids.add(row.contact_id as string);
      }
      contactIds = Array.from(ids);
      if (contactIds.length === 0) {
        return new NextResponse(buildCsv([]), {
          headers: csvHeaders("contacts.csv"),
        });
      }
    }

    let query = supabaseAdmin
      .from("contacts")
      .select(
        "id, first_name, last_name, email, phone, tags, marketing_opt_in, created_at"
      )
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    if (contactIds) {
      query = query.in("id", contactIds);
    }
    if (tag) {
      query = query.contains("tags", [tag]);
    }
    if (marketingOnly) {
      query = query.eq("marketing_opt_in", true);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Admin contacts export error:", error);
      return NextResponse.json(
        { error: "Failed to export contacts." },
        { status: 500 }
      );
    }

    return new NextResponse(buildCsv(data ?? []), {
      headers: csvHeaders(filenameFor(tournamentId, tag)),
    });
  } catch (err) {
    console.error("Admin contacts export error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

type ContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  tags: string[];
  marketing_opt_in: boolean;
  created_at: string;
};

function buildCsv(rows: ContactRow[]): string {
  const header = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "tags",
    "marketing_opt_in",
    "created_at",
  ].join(",");

  const body = rows
    .map((r) =>
      [
        csvEscape(r.first_name),
        csvEscape(r.last_name),
        csvEscape(r.email),
        csvEscape(r.phone ?? ""),
        csvEscape((r.tags ?? []).join("|")),
        csvEscape(r.marketing_opt_in ? "yes" : "no"),
        csvEscape(r.created_at),
      ].join(",")
    )
    .join("\r\n");

  return `${header}\r\n${body}\r\n`;
}

function csvHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
}

function filenameFor(
  tournamentId: string | null,
  tag: string | null
): string {
  const parts = ["contacts"];
  if (tournamentId) parts.push(`tournament-${tournamentId.slice(0, 8)}`);
  if (tag) parts.push(`tag-${tag.replace(/[^a-z0-9-]/gi, "_")}`);
  return `${parts.join("_")}.csv`;
}
