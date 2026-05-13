import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const SITE_SETTING_CACHE_TAG = "site-settings";

export type StatusPillValue = "open" | "closed" | "warning";
export type StatusPill = { label: string; status: StatusPillValue };

export const STATUS_PILL_VALUES: StatusPillValue[] = ["open", "closed", "warning"];

export type ContactInfo = { email: string; phone: string };

type SettingDef<T> = {
  default: T;
  validate: (raw: unknown) => T | "invalid";
  description: string;
};

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isHttpUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validateStatusPills(raw: unknown): StatusPill[] | "invalid" {
  if (!Array.isArray(raw)) return "invalid";
  const out: StatusPill[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return "invalid";
    const e = entry as Record<string, unknown>;
    const label = isString(e.label) ? e.label.trim() : "";
    const status = e.status;
    if (!label) return "invalid";
    if (typeof status !== "string" || !STATUS_PILL_VALUES.includes(status as StatusPillValue)) {
      return "invalid";
    }
    out.push({ label, status: status as StatusPillValue });
  }
  if (out.length === 0) return "invalid";
  if (out.length > 6) return "invalid";
  return out;
}

function validateNonEmptyString(raw: unknown): string | "invalid" {
  if (!isString(raw)) return "invalid";
  const trimmed = raw.trim();
  if (!trimmed) return "invalid";
  if (trimmed.length > 500) return "invalid";
  return trimmed;
}

function validateOptionalString(raw: unknown, max = 200): string | "invalid" {
  if (raw == null || raw === "") return "";
  if (!isString(raw)) return "invalid";
  const t = raw.trim();
  if (t.length > max) return "invalid";
  return t;
}

function validateHttpUrl(raw: unknown): string | "invalid" {
  if (!isHttpUrl(raw)) return "invalid";
  return (raw as string).trim();
}

export const SITE_SETTING_DEFS = {
  "home.status_pills": {
    default: [
      { label: "Registration Open", status: "open" },
      { label: "Fields: Open", status: "open" },
    ],
    validate: validateStatusPills,
    description: "Status indicators shown in the home hero (1–6 entries).",
  } satisfies SettingDef<StatusPill[]>,
  "footer.address": {
    default: "14062 Ambrose St, Houston, TX 77045",
    validate: validateNonEmptyString,
    description: "Mailing/visit address shown in the site footer.",
  } satisfies SettingDef<string>,
  "footer.maps_url": {
    default:
      "https://www.google.com/maps/dir/?api=1&destination=14062+Ambrose+St,+Houston,+TX+77045",
    validate: validateHttpUrl,
    description: "Google Maps directions URL (must start with http:// or https://).",
  } satisfies SettingDef<string>,
  "footer.whatsapp_url": {
    default: "https://chat.whatsapp.com/HzBW39TgVemIA6EHWMnInY",
    validate: validateHttpUrl,
    description: "WhatsApp community invite URL.",
  } satisfies SettingDef<string>,
  "contact.email": {
    default: "houspremiersoccer@gmail.com",
    validate: validateNonEmptyString,
    description: "Public contact email shown in the footer.",
  } satisfies SettingDef<string>,
  "contact.phone": {
    default: "",
    validate: (raw) => validateOptionalString(raw, 40),
    description: "Optional public contact phone number (leave blank to hide).",
  } satisfies SettingDef<string>,
} as const;

export type SiteSettingKey = keyof typeof SITE_SETTING_DEFS;

export type SiteSettingValue<K extends SiteSettingKey> =
  (typeof SITE_SETTING_DEFS)[K]["default"];

export const SITE_SETTING_KEYS = Object.keys(SITE_SETTING_DEFS) as SiteSettingKey[];

export function getDefault<K extends SiteSettingKey>(key: K): SiteSettingValue<K> {
  return SITE_SETTING_DEFS[key].default as SiteSettingValue<K>;
}

export function validateSettingValue<K extends SiteSettingKey>(
  key: K,
  raw: unknown
): SiteSettingValue<K> | "invalid" {
  const result = SITE_SETTING_DEFS[key].validate(raw);
  return result as SiteSettingValue<K> | "invalid";
}

async function fetchSiteSettingRaw(key: SiteSettingKey): Promise<unknown> {
  try {
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.error(`[site-settings] fetch failed for ${key}:`, error.message);
      return null;
    }
    return data?.value ?? null;
  } catch (err) {
    console.error(`[site-settings] fetch failed for ${key}:`, err);
    return null;
  }
}

/**
 * Server-only read with 60s ISR cache. Falls back to the registered default
 * when the row is missing, malformed, or Supabase is unavailable, so public
 * pages always render with sensible content.
 */
export async function getSiteSetting<K extends SiteSettingKey>(
  key: K
): Promise<SiteSettingValue<K>> {
  const cached = unstable_cache(
    () => fetchSiteSettingRaw(key),
    ["site-setting", key],
    { revalidate: 60, tags: [SITE_SETTING_CACHE_TAG] }
  );
  const raw = await cached();
  if (raw == null) return getDefault(key);
  const validated = validateSettingValue(key, raw);
  if (validated === "invalid") {
    console.warn(`[site-settings] stored value for ${key} failed validation; using default`);
    return getDefault(key);
  }
  return validated;
}

/** Bulk fetch all known keys (used by the admin form). Server-only. */
export async function getAllSiteSettings(): Promise<{
  [K in SiteSettingKey]: SiteSettingValue<K>;
}> {
  const entries = await Promise.all(
    SITE_SETTING_KEYS.map(async (k) => [k, await getSiteSetting(k)] as const)
  );
  return Object.fromEntries(entries) as { [K in SiteSettingKey]: SiteSettingValue<K> };
}
