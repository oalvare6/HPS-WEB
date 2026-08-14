/**
 * Canonical host rules — `src/lib/canonical-host.ts`.
 *
 * This logic sits in front of every request on the live site, so the failure
 * modes are severe in both directions: redirect the canonical host and the
 * whole site loops forever; fail to redirect an alias and the duplicate-site
 * problem stays. Both are covered below.
 *
 * Run: npx tsx scripts/test-canonical-host.ts
 */
import {
  CANONICAL_HOST,
  canonicalRedirectHost,
} from "../src/lib/canonical-host";

let passed = 0;
let failed = 0;

function check(
  label: string,
  host: string | null | undefined,
  vercelEnv: string | undefined,
  expected: string | null
) {
  const actual = canonicalRedirectHost(host, vercelEnv);
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(
      `  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`
    );
  }
}

console.log("\ncanonical-host\n");

// The loop guard. If this ever returns a host, production redirects to itself
// forever and the site is down.
check(
  "canonical host is served, never redirected",
  CANONICAL_HOST,
  "production",
  null
);
check(
  "canonical host with an explicit port is still canonical",
  `${CANONICAL_HOST}:443`,
  "production",
  null
);
check(
  "canonical host is matched case-insensitively",
  CANONICAL_HOST.toUpperCase(),
  "production",
  null
);

// The apex is 307'd to www by Vercel before this runs. Serving it directly
// here avoids stacking a second redirect on top of Vercel's.
check(
  "apex is served, not double-redirected",
  "houstonpremiersoccer.com",
  "production",
  null
);

// The five aliases that were all serving the live site on 2026-08-14.
for (const alias of [
  "hps-web-three.vercel.app",
  "hps-web-oalvare6s-projects.vercel.app",
  "hps-web-git-main-oalvare6s-projects.vercel.app",
  "hps-etj8vxdbv-oalvare6s-projects.vercel.app",
]) {
  check(`production alias redirects: ${alias}`, alias, "production", CANONICAL_HOST);
}

// Previews must keep working on their own hostnames, or every preview deploy
// becomes untestable.
check(
  "preview deployment is left alone",
  "hps-web-git-some-branch-oalvare6s-projects.vercel.app",
  "preview",
  null
);
check("local dev is left alone", "localhost:3000", undefined, null);
check(
  "preview env is left alone even on an odd host",
  "anything.example.com",
  "preview",
  null
);

// Degenerate input must never produce a redirect — a missing Host header
// redirecting to the canonical host would be a loop risk on health checks.
check("missing host is served", null, "production", null);
check("empty host is served", "", "production", null);
check("whitespace-only host is served", "   ", "production", null);
check("port-only host is served", ":443", "production", null);

console.log(`\n${passed}/${passed + failed} passed\n`);
if (failed > 0) process.exit(1);
