import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as { registrationId?: string };

    if (!body.registrationId) {
      return NextResponse.json(
        { error: "registrationId is required." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("registrations")
      .update({
        waiver_signed: true,
        waiver_signed_at: new Date().toISOString(),
        docuseal_status: "signed",
      })
      .eq("id", body.registrationId);

    if (error) {
      console.error("Override waiver update error:", error);
      return NextResponse.json(
        { error: "Failed to update registration." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Override waiver error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
