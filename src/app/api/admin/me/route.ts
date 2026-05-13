import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";

export async function GET() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;
  return NextResponse.json({ ok: true });
}
