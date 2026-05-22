import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PRODUCTION_ORIGIN = "https://houstonpremiersoccer.com";
const LOCAL_CALLBACK = "http://localhost:3000/auth/callback";

type CheckStatus = "ok" | "warn" | "fail" | "manual";

type DiagnosticCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

export type AuthDiagnosticsPayload = {
  checkedAt: string;
  env: {
    supabaseUrl: { set: boolean; host: string | null; reachable: boolean | null };
    anonKey: { set: boolean; shapeValid: boolean | null };
    serviceRoleKey: { set: boolean };
    siteUrl: { set: boolean; value: string | null };
  };
  auth: {
    siteUrlExpected: string;
    siteUrlFromApi: string | null;
    siteUrlNote: string;
    redirectUrlsExpected: string[];
    redirectUrlsNote: string;
  };
  serviceRoleProbe: { ok: boolean; error: string | null };
  checks: DiagnosticCheck[];
};

function isJwtShape(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

function buildExpectedRedirectUrls(siteUrl: string | null): string[] {
  const urls = new Set<string>([
    `${PRODUCTION_ORIGIN}/auth/callback`,
    LOCAL_CALLBACK,
  ]);
  if (siteUrl) {
    try {
      const origin = new URL(siteUrl).origin;
      urls.add(`${origin}/auth/callback`);
    } catch {
      // ignore invalid NEXT_PUBLIC_SITE_URL
    }
  }
  return [...urls].sort();
}

async function probeSupabaseReachable(
  supabaseUrl: string
): Promise<boolean | null> {
  try {
    const healthUrl = new URL("/auth/v1/health", supabaseUrl);
    const res = await fetch(healthUrl.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchAuthSiteUrlFromApi(): Promise<{
  siteUrl: string | null;
  note: string;
}> {
  const admin = supabaseAdmin.auth.admin as {
    getSettings?: () => Promise<{
      data?: { site_url?: string };
      error?: { message?: string };
    }>;
  };

  if (typeof admin.getSettings !== "function") {
    return {
      siteUrl: null,
      note:
        "supabase.auth.admin.getSettings is not available in this SDK version. Confirm Site URL in Supabase Dashboard → Authentication → URL Configuration.",
    };
  }

  try {
    const { data, error } = await admin.getSettings();
    if (error) {
      return {
        siteUrl: null,
        note: `Could not read auth settings via API: ${error.message ?? "unknown error"}. Confirm Site URL in the dashboard.`,
      };
    }
    const siteUrl =
      typeof data?.site_url === "string" && data.site_url.length > 0
        ? data.site_url
        : null;
    return {
      siteUrl,
      note: siteUrl
        ? "Site URL read from Supabase Auth admin API."
        : "API returned no site_url. Confirm Site URL in the dashboard.",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return {
      siteUrl: null,
      note: `Auth settings API call failed: ${message}. Confirm Site URL in the dashboard.`,
    };
  }
}

function buildChecks(input: {
  supabaseUrlSet: boolean;
  supabaseReachable: boolean | null;
  anonKeySet: boolean;
  anonKeyValid: boolean | null;
  serviceRoleSet: boolean;
  serviceRoleOk: boolean;
  siteUrlSet: boolean;
  siteUrlValue: string | null;
  siteUrlFromApi: string | null;
}): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  checks.push({
    id: "env_supabase_url",
    label: "NEXT_PUBLIC_SUPABASE_URL is set",
    status: input.supabaseUrlSet ? "ok" : "fail",
    detail: input.supabaseUrlSet
      ? "Present in server environment."
      : "Missing — magic link and session refresh will fail.",
  });

  checks.push({
    id: "env_supabase_reachable",
    label: "Supabase project responds (auth health)",
    status: !input.supabaseUrlSet
      ? "fail"
      : input.supabaseReachable === true
        ? "ok"
        : input.supabaseReachable === false
          ? "fail"
          : "warn",
    detail:
      input.supabaseReachable === true
        ? "GET /auth/v1/health succeeded."
        : input.supabaseReachable === false
          ? "Could not reach Supabase auth health endpoint."
          : "Skipped — no project URL configured.",
  });

  checks.push({
    id: "env_anon_key",
    label: "NEXT_PUBLIC_SUPABASE_ANON_KEY shape",
    status: !input.anonKeySet
      ? "fail"
      : input.anonKeyValid
        ? "ok"
        : "warn",
    detail: !input.anonKeySet
      ? "Missing anon key."
      : input.anonKeyValid
        ? "Looks like a JWT (three segments)."
        : "Set but does not look like a JWT — verify in Supabase Dashboard → Settings → API.",
  });

  checks.push({
    id: "env_service_role",
    label: "SUPABASE_SERVICE_ROLE_KEY + admin API",
    status: !input.serviceRoleSet
      ? "fail"
      : input.serviceRoleOk
        ? "ok"
        : "fail",
    detail: !input.serviceRoleSet
      ? "Missing service role key."
      : input.serviceRoleOk
        ? "listUsers probe succeeded."
        : "Key present but admin auth API call failed.",
  });

  checks.push({
    id: "env_site_url",
    label: "NEXT_PUBLIC_SITE_URL",
    status: input.siteUrlSet ? "ok" : "warn",
    detail: input.siteUrlSet
      ? `Set to ${input.siteUrlValue}`
      : "Not set — app falls back to request host / Vercel URL for some redirects.",
  });

  checks.push({
    id: "dashboard_site_url",
    label: "Supabase Auth Site URL",
    status: input.siteUrlFromApi ? "ok" : "manual",
    detail: input.siteUrlFromApi
      ? `API reports: ${input.siteUrlFromApi}`
      : `Expected production: ${PRODUCTION_ORIGIN}. Confirm in dashboard (see docs/AUTH-CONFIG.md).`,
  });

  checks.push({
    id: "dashboard_redirect_urls",
    label: "Supabase Redirect URL allow list",
    status: "manual",
    detail:
      "Must include every /auth/callback origin you use (production, localhost, previews). Listed under redirectUrlsExpected in this response.",
  });

  checks.push({
    id: "dashboard_smtp",
    label: "Custom SMTP + DNS (SPF/DKIM)",
    status: "manual",
    detail:
      "Enable custom SMTP in Supabase for reliable production delivery. See docs/AUTH-CONFIG.md section 4.",
  });

  checks.push({
    id: "dashboard_email_template",
    label: "Magic Link email template uses {{ .ConfirmationURL }}",
    status: "manual",
    detail:
      "Authentication → Email Templates → Magic Link. See docs/AUTH-CONFIG.md section 3.",
  });

  return checks;
}

export async function GET() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";

  const supabaseUrlSet = supabaseUrl.length > 0;
  const anonKeySet = anonKey.length > 0;
  const serviceRoleSet = serviceRoleKey.length > 0;
  const siteUrlSet = siteUrl.length > 0;

  let supabaseHost: string | null = null;
  let supabaseReachable: boolean | null = null;
  if (supabaseUrlSet) {
    try {
      supabaseHost = new URL(supabaseUrl).host;
    } catch {
      supabaseHost = null;
    }
    supabaseReachable = await probeSupabaseReachable(supabaseUrl);
  }

  const anonKeyValid = anonKeySet ? isJwtShape(anonKey) : null;

  let serviceRoleOk = false;
  let serviceRoleError: string | null = null;
  if (serviceRoleSet) {
    try {
      const { error } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });
      if (error) {
        serviceRoleError = error.message;
      } else {
        serviceRoleOk = true;
      }
    } catch (e) {
      serviceRoleError = e instanceof Error ? e.message : "unknown error";
    }
  }

  const { siteUrl: siteUrlFromApi, note: siteUrlNote } = serviceRoleSet
    ? await fetchAuthSiteUrlFromApi()
    : {
        siteUrl: null,
        note: "Set SUPABASE_SERVICE_ROLE_KEY to probe auth settings API.",
      };

  const redirectUrlsExpected = buildExpectedRedirectUrls(siteUrlSet ? siteUrl : null);

  const payload: AuthDiagnosticsPayload = {
    checkedAt: new Date().toISOString(),
    env: {
      supabaseUrl: {
        set: supabaseUrlSet,
        host: supabaseHost,
        reachable: supabaseReachable,
      },
      anonKey: {
        set: anonKeySet,
        shapeValid: anonKeyValid,
      },
      serviceRoleKey: { set: serviceRoleSet },
      siteUrl: { set: siteUrlSet, value: siteUrlSet ? siteUrl : null },
    },
    auth: {
      siteUrlExpected: PRODUCTION_ORIGIN,
      siteUrlFromApi,
      siteUrlNote,
      redirectUrlsExpected,
      redirectUrlsNote:
        "Add each URL to Supabase Dashboard → Authentication → URL Configuration → Redirect URLs. Wildcards may be used for Vercel preview hosts.",
    },
    serviceRoleProbe: {
      ok: serviceRoleOk,
      error: serviceRoleError,
    },
    checks: buildChecks({
      supabaseUrlSet,
      supabaseReachable,
      anonKeySet,
      anonKeyValid,
      serviceRoleSet,
      serviceRoleOk,
      siteUrlSet,
      siteUrlValue: siteUrlSet ? siteUrl : null,
      siteUrlFromApi,
    }),
  };

  return NextResponse.json(payload);
}
