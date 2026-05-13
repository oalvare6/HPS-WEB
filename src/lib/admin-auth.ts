import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAdminSessionCookieValue } from "@/lib/app-signing";

export async function verifyAdmin(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUser = process.env.ADMIN_USER;
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!verifyAdminSessionCookieValue(token, adminUser)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("ADMIN_SESSION_SECRET")) {
      return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
