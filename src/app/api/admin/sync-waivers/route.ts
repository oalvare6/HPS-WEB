import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import { fetchSubmissionSnapshot, recordSignedWaiver } from "@/lib/waiver-capture";

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
      .select("id, contact_id, waiver_type, docuseal_submission_id, first_name, last_name")
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
    let withDocument = 0;
    const results: Array<{
      name: string;
      status: string;
      updated: boolean;
      document: boolean;
    }> = [];

    for (const reg of pending) {
      const name = `${reg.first_name} ${reg.last_name}`;
      try {
        const snapshot = await fetchSubmissionSnapshot(
          reg.docuseal_submission_id,
          apiKey
        );

        if (!snapshot) {
          results.push({ name, status: "api-error", updated: false, document: false });
          continue;
        }
        if (!snapshot.completed) {
          results.push({ name, status: "pending", updated: false, document: false });
          continue;
        }

        // Goes through the shared writer, which stores waiver_document_url.
        // This route used to omit it, which is why production has 97 signed
        // waivers and zero document links.
        const result = await recordSignedWaiver({
          registrationId: reg.id,
          contactId: reg.contact_id,
          waiverType: reg.waiver_type,
          submissionId: reg.docuseal_submission_id,
          completedAt: snapshot.completedAt,
          documentUrl: snapshot.documentUrl,
        });

        if (result.ok) {
          synced++;
          if (result.documentUrl) withDocument++;
          results.push({
            name,
            status: "signed",
            updated: true,
            document: Boolean(result.documentUrl),
          });
        } else {
          console.error("Sync: update failed for", reg.id, result.error);
          results.push({ name, status: "update-failed", updated: false, document: false });
        }
      } catch (err) {
        console.error("Sync: error checking submission", reg.docuseal_submission_id, err);
        results.push({ name, status: "error", updated: false, document: false });
      }
    }

    return NextResponse.json({
      synced,
      withDocument,
      total: pending.length,
      results,
    });
  } catch (err) {
    console.error("Sync waivers error:", err);
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}
