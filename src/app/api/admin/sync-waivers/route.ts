import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

export async function POST() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DOCUSEAL_API_KEY not configured." },
      { status: 500 }
    );
  }

  try {
    const { data: pending, error: fetchErr } = await supabaseAdmin
      .from("registrations")
      .select("id, docuseal_submission_id, first_name, last_name")
      .eq("docuseal_status", "sent")
      .not("docuseal_submission_id", "is", null);

    if (fetchErr) {
      console.error("Sync: failed to fetch pending registrations", fetchErr);
      return NextResponse.json({ error: "Database query failed." }, { status: 500 });
    }

    if (!pending || pending.length === 0) {
      return NextResponse.json({ synced: 0, total: 0 });
    }

    let synced = 0;
    const results: Array<{ name: string; status: string; updated: boolean }> = [];

    for (const reg of pending) {
      try {
        const dsRes = await fetch(
          `https://api.docuseal.com/submissions/${reg.docuseal_submission_id}`,
          { headers: { "X-Auth-Token": apiKey } }
        );

        if (!dsRes.ok) {
          results.push({ name: `${reg.first_name} ${reg.last_name}`, status: `api-error-${dsRes.status}`, updated: false });
          continue;
        }

        const dsData = await dsRes.json();
        const submitters = dsData.submitters ?? [];
        const completed = submitters.some(
          (s: { status?: string }) => s.status === "completed"
        );

        if (completed) {
          const completedAt = submitters.find(
            (s: { status?: string }) => s.status === "completed"
          )?.completed_at;

          const { error: updateErr } = await supabaseAdmin
            .from("registrations")
            .update({
              waiver_signed: true,
              waiver_signed_at: completedAt ?? new Date().toISOString(),
              docuseal_status: "signed",
            })
            .eq("id", reg.id);

          if (!updateErr) {
            synced++;
            results.push({ name: `${reg.first_name} ${reg.last_name}`, status: "signed", updated: true });
          } else {
            console.error("Sync: update failed for", reg.id, updateErr);
            results.push({ name: `${reg.first_name} ${reg.last_name}`, status: "update-failed", updated: false });
          }
        } else {
          results.push({ name: `${reg.first_name} ${reg.last_name}`, status: dsData.status ?? "pending", updated: false });
        }
      } catch (err) {
        console.error("Sync: error checking submission", reg.docuseal_submission_id, err);
        results.push({ name: `${reg.first_name} ${reg.last_name}`, status: "error", updated: false });
      }
    }

    return NextResponse.json({ synced, total: pending.length, results });
  } catch (err) {
    console.error("Sync waivers error:", err);
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}
