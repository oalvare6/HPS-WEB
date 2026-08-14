import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { setAdminSessionCookie } from "@/lib/admin-session";

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

    const response = NextResponse.json({ success: true });
    try {
      setAdminSessionCookie(response, adminUser);
    } catch (e) {
      const missingProdSecret =
        e instanceof Error && e.message.includes("APP_SIGNING_SECRET");
      return NextResponse.json(
        {
          error: missingProdSecret
            ? "Missing APP_SIGNING_SECRET on the server. In Vercel: your project → Settings → Environment Variables → add APP_SIGNING_SECRET with a long random value (terminal: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"). Save, then Redeploy. This variable is only for signing your session cookie — it is not your admin password."
            : "Could not create admin session. Check server logs.",
        },
        { status: 500 }
      );
    }

    return response;
  } catch {
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
