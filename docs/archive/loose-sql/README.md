# Archived loose SQL scripts

These nine files used to live directly under `supabase/` (not in `supabase/migrations/`) and
were applied by hand in the Supabase SQL editor. Four of them were the **only** definition of
tables the application depends on, which is why an empty database could never be built from
the migrations alone and why every Supabase Preview branch failed from 2026-05-13 onwards.
Stage 1.6 (`docs/STAGE-1-6-MIGRATION-RECONCILIATION.md`, 2026-09-10) captured each one as a
real, idempotent migration and moved the originals here so there is one definition of the
schema, not two.

**Nothing here is applied by any tool.** The Supabase CLI and Preview branches only read
`supabase/migrations/`. Keep these for the history of how production got its shape; do not
run them.

| File | What it defined | Where it lives now |
|---|---|---|
| `tournaments.sql` | `public.tournaments`, its two indexes, `set_updated_at()` and the trigger, plus a "Spring Classic 2026" seed row | `supabase/migrations/20260513000100_create_tournaments.sql` (structure only; the seed row was not carried over) |
| `tournaments-featured-and-updates.sql` | `tournaments.is_featured` + partial index, `public.tournament_updates` and its trigger | `supabase/migrations/20260513000200_add_tournaments_featured_and_updates.sql` |
| `payments.sql` | `public.payments` and its two indexes | `supabase/migrations/20260327000000_create_payments.sql` |
| `site-settings.sql` | `public.site_settings` and its trigger | `supabase/migrations/20260513000300_create_site_settings.sql` |
| `storage-bucket.sql` | the private `waiver-signatures` Storage bucket | `supabase/migrations/20260513000400_create_storage_buckets.sql` |
| `tournament-images-bucket.sql` | the public `tournament-images` bucket and its read policy | `supabase/migrations/20260513000400_create_storage_buckets.sql` |
| `tournament-rounds.sql` | `public.tournament_rounds` | Already a migration: `20260513120000_create_tournament_rounds.sql` (identical DDL). Nothing to carry over. |
| `league-round-overrides.sql` | the legacy `public.league_round_overrides` table | Dropped from production long ago; `20260513121100_drop_legacy_overrides.sql` removes it wherever it exists. Deliberately **not** recreated by any migration. |
| `migrate-registration-type-adult-youth.sql` | a one-off that would narrow `registrations_registration_type_check` to `('adult','youth')` | **Never applied to production**, which still allows `'team'` and `'freeagent'` (0 rows use them). The baseline migration `20260319215600_create_registrations.sql` already gives a fresh database the narrow check; narrowing production is a separate, deliberate change recorded in the Stage 1.6 report. |
