import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY!;
const BATCH_LIMIT = 50;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  if (!DOCUSEAL_API_KEY) {
    return NextResponse.json(
      { error: "DOCUSEAL_API_KEY is not configured." },
      { status: 500 }
    );
  }

  try {
    const { data: stale, error: queryErr } = await supabaseAdmin
      .from("registrations")
      .select("id, docuseal_submission_id")
      .eq("docuseal_status", "sent")
      .not("docuseal_submission_id", "is", null)
      .limit(BATCH_LIMIT);

    if (queryErr) {
      console.error("Sync waivers: query failed", queryErr);
      return NextResponse.json(
        { error: "Failed to query registrations." },
        { status: 500 }
      );
    }

    if (!stale || stale.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0, errors: [], total: 0 });
    }

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const reg of stale) {
      try {
        const res = await fetch(
          `https://api.docuseal.com/submissions/${reg.docuseal_submission_id}`,
          {
            headers: {
              "X-Auth-Token": DOCUSEAL_API_KEY,
            },
          }
        );

        if (res.status === 429) {
          errors.push("Rate limited by DocuSeal — try again shortly.");
          break;
        }

        if (!res.ok) {
          errors.push(
            `Submission ${reg.docuseal_submission_id}: HTTP ${res.status}`
          );
          continue;
        }

        const submission = await res.json();

        const isCompleted =
          submission.status === "completed" ||
          submission.submitters?.some(
            (s: { status: string }) => s.status === "completed"
          );

        if (!isCompleted) {
          skipped++;
          await delay(150);
          continue;
        }

        const completedAt =
          submission.completed_at ??
          submission.submitters?.find(
            (s: { status: string }) => s.status === "completed"
          )?.completed_at ??
          new Date().toISOString();

        const documentUrl: string | null =
          submission.combined_document_url ??
          submission.documents?.[0]?.url ??
          null;

        const { error: updateErr } = await supabaseAdmin
          .from("registrations")
          .update({
            docuseal_status: "signed",
            waiver_signed: true,
            waiver_signed_at: completedAt,
            waiver_document_url: documentUrl,
          })
          .eq("id", reg.id);

        if (updateErr) {
          errors.push(`Update failed for ${reg.id}: ${updateErr.message}`);
          continue;
        }

        synced++;
      } catch (err) {
        errors.push(
          `Submission ${reg.docuseal_submission_id}: ${err instanceof Error ? err.message : "unknown error"}`
        );
      }

      await delay(150);
    }

    return NextResponse.json({
      synced,
      skipped,
      errors,
      total: stale.length,
    });
  } catch (err) {
    console.error("Sync waivers error:", err);
    return NextResponse.json(
      { error: "Failed to sync waivers." },
      { status: 500 }
    );
  }
}
