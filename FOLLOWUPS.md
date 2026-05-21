# FOLLOWUPS

Append-only log of issues discovered during the HPS admin and registration overhaul
that are out of scope for the current phase. One line per item.

Format:

```
- [phase N] <issue> — discovered YYYY-MM-DD
```

## Items

<!-- Append new items below this line. -->
- [phase 0] reconciled loose `supabase/registrations.sql` into `supabase/migrations/20260319215600_create_registrations.sql` — discovered 2026-05-21
- [phase 0] reconciled loose `supabase/add-docuseal-columns.sql` into `supabase/migrations/20260319224900_add_docuseal_columns_to_registrations.sql` — discovered 2026-05-21
- [phase 0] deleted `supabase/APPLY_ALL_MIGRATIONS.sql`; redundant paste-bundle of already-applied migrations in `supabase/migrations/` — discovered 2026-05-21
- [phase 0] other loose SQL still in `supabase/` (`tournaments.sql`, `tournament-rounds.sql`, `tournament-images-bucket.sql`, `tournaments-featured-and-updates.sql`, `payments.sql`, `site-settings.sql`, `storage-bucket.sql`, `league-round-overrides.sql`, `migrate-registration-type-adult-youth.sql`) is out of Phase 0 scope but should be reconciled into timestamped migrations or removed in a future hygiene pass — discovered 2026-05-21
- [phase 2] `RegistrationsList` row+expanded-row Tournament link still points to `/admin/tournaments/{id}/edit` to preserve Overview parity; should switch to the Phase 1 view route `/admin/tournaments/{id}` once we have URL-state persistence (Phase 4) so the back button returns to a known filter — discovered 2026-05-21 — RESOLVED in Phase 4
- [phase 2] `/api/admin/registrations/[id]` PATCH only accepts `payment_status` today; expand to a whitelisted set (e.g. `notes`, `registration_type`) when admin row-edit lands — discovered 2026-05-21
- [phase 2] DocuSeal resend uses `PUT /submitters/{id}` with `send_email: true`; verify the response shape against the live DocuSeal account on first manual test and adjust if the email is not actually re-sent — discovered 2026-05-21
- [phase 2] `RegistrationsList` keeps the Registrations tab mounted via `hidden` so the count badge stays fresh; revisit when Phase 4 introduces URL-state for `activeTab` — discovered 2026-05-21 — Phase 4 keeps the hidden-mount pattern intentionally so the registrations count stays live while on Payments; URL state for `tab` now persists across reloads but the dual-mount is still warranted, leaving as accepted
- [phase 2] CSV "Amount Paid" column emits an empty string for zero totals to match the existing Overview export; consider always emitting a numeric `0` when the export gets a dedicated review — discovered 2026-05-21
- [phase 3] `registrations.team_name` is free text and is never reconciled to `teams.name`; if Teams is kept, decide whether `team_name` becomes a derived display field or stays as a legacy free-text fallback — discovered 2026-05-21
- [phase 3] `tournaments.max_teams` is editable on the tournament form but never compared against the actual team count anywhere in the UI; revisit when Teams gets a real workflow or remove the column with the rest of Teams — discovered 2026-05-21
- [phase 3] current `/admin/teams` UI adds members from the `contacts` table directly, so a person can be on a team for a tournament without having a registration row for that tournament; if Teams is kept, switch the membership source to `registrations` — discovered 2026-05-21
- [phase 4] `/admin/tournaments` has no filter UI today, so only scroll-restoration is wired; if/when a status or featured filter ships, persist it through `useQueryParam` like the other list pages — discovered 2026-05-21
- [phase 4] `RegistrationsList` sort and expanded-row state are still local-only; URL-syncing `sort`, `dir`, and expanded id would let admins deep-link to a specific roster view, but is out of scope for Phase 4 (filter-only) — discovered 2026-05-21
- [phase 4] `useScrollRestoration` is opt-in per page via a string key; if more admin lists are added later, remember to wire the hook in or extract a generic admin list wrapper that does it automatically — discovered 2026-05-21
- [phase 5] `needs_admin_review` is set on registrations but not yet surfaced in `RegistrationsList`, `/api/admin/registrations` GET select, or the contacts merge UI; expose it as a badge/filter and wire a one-click "merge contacts" action in a later admin-UX pass — discovered 2026-05-21
- [phase 5] `linkRegistrationToContact` runs after the registration insert but before the waiver-skip / DocuSeal branches; if either of those branches later wants to use the post-link `contact_id`, re-read the row instead of trusting the in-memory `contact` from `upsertContactByEmail` — discovered 2026-05-21
- [phase 5] backfill script requires `npx tsx --env-file=.env.local`; consider adding a `package.json` script alias (`backfill:reg-contacts`) once the team is comfortable with the dry-run output — discovered 2026-05-21
