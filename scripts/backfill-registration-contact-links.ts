/**
 * Phase 5 backfill: link legacy `registrations` rows to a `contacts` row.
 *
 * Defaults to --dry-run. With --apply, updates `registrations.contact_id`
 * (and `needs_admin_review = true` for ambiguous multi-match rows).
 *
 * Output: one JSON object per line on stdout, e.g.
 *   {"registration_id":"...","proposed_contact_id":"...","match_reason":"email","confidence":"high"}
 *
 * Match logic is `findContactCandidates` + `resolveContactLink` from
 * `src/lib/registration-contact-linking.ts`. Normalization comes from
 * `src/lib/contacts.ts`. No reimplementation here.
 *
 * Run (PowerShell, from repo root):
 *   npx tsx --env-file=.env.local scripts/backfill-registration-contact-links.ts
 *   npx tsx --env-file=.env.local scripts/backfill-registration-contact-links.ts --apply
 *
 * Environment variables required (read by tsx via --env-file):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Stdout is JSON-line output only; all human-readable logs go to stderr so
 * piping into a file (`> backfill.log`) produces a clean JSONL stream.
 */

import {
  findContactCandidates,
  resolveContactLink,
  type LinkResolution,
} from "../src/lib/registration-contact-linking";
import { supabaseAdmin } from "../src/lib/supabase-admin";

type LegacyRegistration = {
  id: string;
  email: string | null;
  phone: string | null;
  contact_id: string | null;
};

type OutputLine = {
  registration_id: string;
  proposed_contact_id: string;
  match_reason: "email" | "phone" | "both";
  confidence: "high" | "low";
};

function parseArgs(argv: string[]): { apply: boolean } {
  const apply = argv.includes("--apply");
  if (apply && argv.includes("--dry-run")) {
    process.stderr.write(
      "[backfill] both --apply and --dry-run passed; --apply wins.\n"
    );
  }
  return { apply };
}

async function loadCandidateRegistrations(): Promise<LegacyRegistration[]> {
  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select("id, email, phone, contact_id")
    .is("contact_id", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load registrations: ${error.message}`);
  }
  return (data ?? []) as LegacyRegistration[];
}

async function applyLink(
  registrationId: string,
  resolution: LinkResolution
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (resolution.contactId) patch.contact_id = resolution.contactId;
  if (resolution.needsAdminReview) patch.needs_admin_review = true;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabaseAdmin
    .from("registrations")
    .update(patch)
    .eq("id", registrationId);

  if (error) {
    throw new Error(
      `Update failed for registration ${registrationId}: ${error.message}`
    );
  }
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const mode = apply ? "APPLY (writes enabled)" : "DRY-RUN (no writes)";
  process.stderr.write(`[backfill] mode: ${mode}\n`);

  const rows = await loadCandidateRegistrations();
  process.stderr.write(
    `[backfill] ${rows.length} registrations with NULL contact_id\n`
  );

  let proposed = 0;
  let unmatched = 0;
  let ambiguous = 0;
  let applied = 0;
  let applyErrors = 0;

  for (const row of rows) {
    const candidates = await findContactCandidates({
      email: row.email,
      phone: row.phone,
    });
    const resolution = resolveContactLink(candidates);

    if (!resolution.contactId || !resolution.matchReason || !resolution.confidence) {
      unmatched += 1;
      continue;
    }

    proposed += 1;
    if (resolution.confidence === "low") ambiguous += 1;

    const line: OutputLine = {
      registration_id: row.id,
      proposed_contact_id: resolution.contactId,
      match_reason: resolution.matchReason,
      confidence: resolution.confidence,
    };
    process.stdout.write(`${JSON.stringify(line)}\n`);

    if (apply) {
      try {
        await applyLink(row.id, resolution);
        applied += 1;
      } catch (err) {
        applyErrors += 1;
        process.stderr.write(
          `[backfill] ${
            err instanceof Error ? err.message : String(err)
          }\n`
        );
      }
    }
  }

  process.stderr.write(
    `[backfill] done. proposed=${proposed} ambiguous=${ambiguous} unmatched=${unmatched}` +
      (apply ? ` applied=${applied} errors=${applyErrors}` : "") +
      "\n"
  );
}

main().catch((err) => {
  process.stderr.write(
    `[backfill] fatal: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
