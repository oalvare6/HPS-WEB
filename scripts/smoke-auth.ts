/**
 * Non-destructive player-auth smoke test.
 *
 * Walks every Supabase Auth entry point HPS exposes and asserts that each
 * one is reachable and returns the expected shape. Magic-link and recovery
 * mints DO send a real email to whatever `AUTH_SMOKE_EMAIL` points at, but
 * the links are never consumed by the script.
 *
 * Run:
 *   AUTH_SMOKE=1 \
 *   AUTH_SMOKE_EMAIL=test@example.com \
 *   npx tsx --env-file=.env.local scripts/smoke-auth.ts
 *
 * Optional env:
 *   AUTH_SMOKE_BASE_URL       default http://localhost:3000
 *   AUTH_SMOKE_PASSWORD       enables the password sign-in leg
 *   AUTH_SMOKE_ADMIN_COOKIE   admin HMAC cookie value (`hps_admin=...`) to
 *                             probe /api/admin/diagnostics/auth as an admin.
 *
 * Without AUTH_SMOKE=1 the script exits 0 immediately so it's safe to wire
 * into CI without burning auth quota or sending emails.
 *
 * Output is one JSON line per step: `{ step, ok, ms, detail }`. Exit code is
 * 0 when every step is `ok: true`, otherwise 1.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../src/lib/supabase-admin";

type StepResult = {
  step: string;
  ok: boolean;
  ms: number;
  detail: string;
};

const ADMIN_COOKIE_NAME = "hps_admin";

function emit(result: StepResult): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function timed(
  step: string,
  run: () => Promise<{ ok: boolean; detail: string }>
): Promise<StepResult> {
  const started = Date.now();
  try {
    const { ok, detail } = await run();
    return { step, ok, ms: Date.now() - started, detail };
  } catch (err) {
    return {
      step,
      ok: false,
      ms: Date.now() - started,
      detail: `threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
}

function createAnonClient(): SupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function probeDiagnostics(
  baseUrl: string,
  adminCookie: string | null
): Promise<{ ok: boolean; detail: string }> {
  const headers: Record<string, string> = {};
  if (adminCookie) {
    headers["cookie"] = `${ADMIN_COOKIE_NAME}=${adminCookie}`;
  }
  const res = await fetch(`${baseUrl}/api/admin/diagnostics/auth`, {
    headers,
    redirect: "manual",
  });

  if (!adminCookie) {
    if (res.status === 401 || res.status === 403) {
      return {
        ok: true,
        detail: `unauthed probe ok (status ${res.status})`,
      };
    }
    return {
      ok: false,
      detail: `expected 401/403 for unauthed probe, got ${res.status}`,
    };
  }

  if (res.status !== 200) {
    return {
      ok: false,
      detail: `expected 200 for admin probe, got ${res.status}`,
    };
  }

  const body = (await res.json()) as {
    env?: { supabaseUrl?: { reachable?: boolean | null } };
    serviceRoleProbe?: { ok?: boolean };
  };
  const reachable = body.env?.supabaseUrl?.reachable === true;
  const serviceRoleOk = body.serviceRoleProbe?.ok === true;
  if (!reachable) {
    return { ok: false, detail: "diagnostics: supabase auth health unreachable" };
  }
  if (!serviceRoleOk) {
    return { ok: false, detail: "diagnostics: service role probe failed" };
  }
  return { ok: true, detail: "admin probe ok; supabase reachable + service role valid" };
}

async function probeStatusUnauthed(
  baseUrl: string
): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch(`${baseUrl}/api/me/status`, {
    redirect: "manual",
  });
  if (res.status !== 200) {
    return { ok: false, detail: `expected 200, got ${res.status}` };
  }
  const body = (await res.json()) as {
    authed?: boolean;
    displayName?: string | null;
  };
  if (body.authed !== false) {
    return {
      ok: false,
      detail: `expected { authed: false }, got ${JSON.stringify(body)}`,
    };
  }
  return { ok: true, detail: "authed=false, displayName=null" };
}

async function probeAdminListUsers(
  email: string
): Promise<{ ok: boolean; detail: string }> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) {
    return { ok: false, detail: `listUsers error: ${error.message}` };
  }
  const target = data.users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
  );
  if (target) {
    const identities = (target.identities ?? [])
      .map((i) => i.provider)
      .join(",");
    return {
      ok: true,
      detail: `auth user exists (id=${target.id}, identities=${identities || "none"})`,
    };
  }
  return {
    ok: true,
    detail: `no auth user for ${email} yet (claim flow path)`,
  };
}

async function probeMagicLink(
  anon: SupabaseClient,
  baseUrl: string,
  email: string
): Promise<{ ok: boolean; detail: string }> {
  const redirectUrl = new URL("/auth/callback", baseUrl);
  redirectUrl.searchParams.set("next", "/me");
  const { error } = await anon.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl.toString(),
    },
  });
  if (error) {
    return { ok: false, detail: `signInWithOtp error: ${error.message}` };
  }
  return { ok: true, detail: `magic link sent to ${email} (not consumed)` };
}

async function probeOptionalPassword(
  anon: SupabaseClient,
  email: string,
  password: string | null
): Promise<{ ok: boolean; detail: string }> {
  if (!password) {
    return { ok: true, detail: "skipped (no AUTH_SMOKE_PASSWORD)" };
  }

  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return {
      ok: false,
      detail: `signInWithPassword error: ${error.message}`,
    };
  }
  const sessionEmail = data.user?.email ?? null;
  if (!sessionEmail) {
    return { ok: false, detail: "no email on returned session user" };
  }
  if (sessionEmail.toLowerCase() !== email.toLowerCase()) {
    return {
      ok: false,
      detail: `session email mismatch: got ${sessionEmail}`,
    };
  }

  const signOutRes = await anon.auth.signOut();
  if (signOutRes.error) {
    return {
      ok: false,
      detail: `signed in but signOut failed: ${signOutRes.error.message}`,
    };
  }

  return { ok: true, detail: `password sign-in ok for ${email}, signed out` };
}

async function probeRecovery(
  anon: SupabaseClient,
  baseUrl: string,
  email: string
): Promise<{ ok: boolean; detail: string }> {
  const redirectUrl = new URL("/auth/callback", baseUrl);
  redirectUrl.searchParams.set("next", "/auth/reset");
  const { error } = await anon.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl.toString(),
  });
  if (error) {
    return {
      ok: false,
      detail: `resetPasswordForEmail error: ${error.message}`,
    };
  }
  return { ok: true, detail: `recovery email sent to ${email} (not consumed)` };
}

async function probeCallbackInvalid(
  baseUrl: string
): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch(`${baseUrl}/auth/callback?code=invalid-smoke-code`, {
    redirect: "manual",
  });
  // Next route handler returns 302 (default) or 307; either is acceptable
  // as long as the Location points back at /login?error=...
  if (res.status < 300 || res.status >= 400) {
    return {
      ok: false,
      detail: `expected 3xx redirect, got ${res.status}`,
    };
  }
  const location = res.headers.get("location") ?? "";
  if (!location.includes("/login")) {
    return {
      ok: false,
      detail: `redirect did not target /login: ${location || "(no location header)"}`,
    };
  }
  if (!location.includes("error=")) {
    return {
      ok: false,
      detail: `redirect missing ?error= : ${location}`,
    };
  }
  return { ok: true, detail: `callback rejected invalid code → ${location}` };
}

async function main(): Promise<void> {
  if (process.env.AUTH_SMOKE !== "1") {
    emit({
      step: "guard",
      ok: true,
      ms: 0,
      detail: "AUTH_SMOKE not set to 1; exiting without running probes",
    });
    return;
  }

  const email = process.env.AUTH_SMOKE_EMAIL?.trim();
  if (!email) {
    emit({
      step: "guard",
      ok: false,
      ms: 0,
      detail: "AUTH_SMOKE_EMAIL is required when AUTH_SMOKE=1",
    });
    process.exitCode = 1;
    return;
  }

  const baseUrl = (
    process.env.AUTH_SMOKE_BASE_URL?.trim() || "http://localhost:3000"
  ).replace(/\/$/, "");
  const password = process.env.AUTH_SMOKE_PASSWORD?.trim() || null;
  const adminCookie = process.env.AUTH_SMOKE_ADMIN_COOKIE?.trim() || null;

  let anon: SupabaseClient;
  try {
    anon = createAnonClient();
  } catch (err) {
    emit({
      step: "guard",
      ok: false,
      ms: 0,
      detail: `anon client init failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    process.exitCode = 1;
    return;
  }

  const steps: StepResult[] = [];
  const run = async (
    name: string,
    fn: () => Promise<{ ok: boolean; detail: string }>
  ): Promise<void> => {
    const result = await timed(name, fn);
    steps.push(result);
    emit(result);
  };

  await run("diagnostics", () => probeDiagnostics(baseUrl, adminCookie));
  await run("status_unauthed", () => probeStatusUnauthed(baseUrl));
  await run("admin_list_users", () => probeAdminListUsers(email));
  await run("magic_link", () => probeMagicLink(anon, baseUrl, email));
  await run("password_signin", () =>
    probeOptionalPassword(anon, email, password)
  );
  await run("recovery", () => probeRecovery(anon, baseUrl, email));
  await run("callback_invalid", () => probeCallbackInvalid(baseUrl));

  const failed = steps.filter((s) => !s.ok);
  emit({
    step: "summary",
    ok: failed.length === 0,
    ms: 0,
    detail:
      failed.length === 0
        ? `all ${steps.length} steps passed`
        : `${failed.length}/${steps.length} steps failed: ${failed.map((s) => s.step).join(",")}`,
  });
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err) => {
  emit({
    step: "fatal",
    ok: false,
    ms: 0,
    detail: err instanceof Error ? err.message : String(err),
  });
  process.exitCode = 1;
});
