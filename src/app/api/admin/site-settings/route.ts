import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  SITE_SETTING_CACHE_TAG,
  SITE_SETTING_DEFS,
  SITE_SETTING_KEYS,
  getAllSiteSettings,
  validateSettingValue,
  type SiteSettingKey,
} from "@/lib/site-settings";

const KEY_SET = new Set<string>(SITE_SETTING_KEYS);

function isKnownKey(k: unknown): k is SiteSettingKey {
  return typeof k === "string" && KEY_SET.has(k);
}

export async function GET() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const settings = await getAllSiteSettings();
  const meta = Object.fromEntries(
    SITE_SETTING_KEYS.map((k) => [k, { description: SITE_SETTING_DEFS[k].description }])
  );
  return NextResponse.json({ settings, meta });
}

export async function PUT(request: Request) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  }

  const { key, value } = body as { key?: unknown; value?: unknown };

  if (!isKnownKey(key)) {
    return NextResponse.json({ error: "Unknown setting key." }, { status: 400 });
  }

  const validated = validateSettingValue(key, value);
  if (validated === "invalid") {
    return NextResponse.json(
      { error: `Invalid value for ${key}: ${SITE_SETTING_DEFS[key].description}` },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("site_settings")
    .upsert({ key, value: validated as unknown }, { onConflict: "key" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag(SITE_SETTING_CACHE_TAG);

  return NextResponse.json({ ok: true, key, value: validated });
}
