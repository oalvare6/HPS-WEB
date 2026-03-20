import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function verifyAdmin(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const adminUser = process.env.ADMIN_USER;
    if (!adminUser || !decoded.startsWith(`${adminUser}:`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
