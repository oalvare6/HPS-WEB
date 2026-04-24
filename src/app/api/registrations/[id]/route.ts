import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing registration id." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select("email, first_name, payment_status")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("registrations lookup failed:", error);
    return NextResponse.json(
      { error: "Failed to load registration." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  }

  return NextResponse.json({
    email: data.email,
    firstName: data.first_name,
    paymentStatus: data.payment_status,
  });
}
