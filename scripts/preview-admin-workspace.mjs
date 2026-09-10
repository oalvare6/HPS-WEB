/** Local, read-only Stage 2.1 preview. Never reads .env files or uses real services. */
import { cpSync, existsSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { startAdminFixture } from "./fixtures/admin-workspace.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 3021);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Use a local port between 1024 and 65535.");
if (!existsSync(path.join(root, "node_modules/next")))
  throw new Error("Run npm install in the repository first.");
const preview = mkdtempSync(path.join(tmpdir(), "hps-admin-preview-"));
for (const file of [
  "src",
  "public",
  "package.json",
  "tsconfig.json",
  "next-env.d.ts",
  "next.config.ts",
  "tailwind.config.ts",
  "postcss.config.mjs",
]) {
  cpSync(path.join(root, file), path.join(preview, file), { recursive: true });
}
symlinkSync(
  path.join(root, "node_modules"),
  path.join(preview, "node_modules"),
  process.platform === "win32" ? "junction" : "dir",
);
const stub = await startAdminFixture();
const address = stub.address();
// Only OS/runtime variables are inherited. App credentials and .env files are
// excluded, including Stripe, DocuSeal, Resend, Supabase and Vercel credentials.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    [
      "path",
      "systemroot",
      "windir",
      "comspec",
      "pathext",
      "temp",
      "tmp",
      "tmpdir",
      "home",
      "userprofile",
      "appdata",
      "localappdata",
      "lang",
    ].includes(key.toLowerCase()),
  ),
);
Object.assign(env, {
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${address.port}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
  APP_SIGNING_SECRET: "local-admin-workspace-preview-only-signing-secret",
  ADMIN_USER: "fixture",
  ADMIN_PASSWORD: "fixture",
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
});
console.log(
  `\nFixture preview: http://127.0.0.1:${port}/admin\nLogin: fixture / fixture\nSample records only. Data mutations are rejected; previews do not send messages.\nSource snapshot: ${preview}\nRestart this command to include new source changes. Ctrl+C stops the preview.\n`,
);
const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/next/dist/bin/next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { cwd: preview, env, stdio: "inherit", windowsHide: true },
);
child.once("error", (error) => {
  console.error(error.message);
  stub.close();
  process.exitCode = 1;
});
child.once("exit", (code) => {
  stub.close();
  process.exitCode = code ?? 0;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    child.kill();
    stub.close();
  });
