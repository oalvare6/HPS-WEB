import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signAdminSessionCookieValue } from "@/lib/app-signing";

function digestEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };

    const adminUser = process.env.ADMIN_USER;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUser || !adminPassword) {
      return NextResponse.json(
        { error: "Admin credentials not configured." },
        { status: 500 }
      );
    }

    const userOk = digestEqual(body.username ?? "", adminUser);
    const passOk = digestEqual(body.password ?? "", adminPassword);

    if (!userOk || !passOk) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    let token: string;
    try {
      token = signAdminSessionCookieValue(adminUser, 60 * 60 * 8);
    } catch {
      return NextResponse.json(
        { error: "Admin session signing not configured (set ADMIN_SESSION_SECRET in production)." },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
