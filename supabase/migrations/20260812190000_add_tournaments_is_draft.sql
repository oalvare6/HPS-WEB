-- A1 / D1: the one "Event status" switch needs somewhere to keep "Draft".
--
-- Before this, nothing in the schema could hide an event from the public:
-- `getPublicTournaments` returned every row except `status = 'cancelled'`, so
-- Draft and Closed were indistinguishable. This is the single column that makes
-- the fourth state real. Track B folds it into `events.state` during the
-- rename; until then it is deliberately one boolean and nothing more.
--
-- `finished` gets NO column, now or ever — it is derived from the end date by
-- src/lib/tournament-state.ts. See docs/REBUILD-PLAN.md §3, decision D1.

alter table public.tournaments
  add column if not exists is_draft boolean not null default false;

comment on column public.tournaments.is_draft is
  'True while the owner is still setting the event up: hidden from every public listing and page, and cannot take sign-ups or payments. Existing events default to false so nothing disappears when this ships.';

-- The public read policy is `using (true)`, which would leave drafts readable
-- straight off the anon PostgREST endpoint even though every page hides them.
-- The app itself reads tournaments through `supabaseAdmin` (service role, which
-- bypasses RLS), so narrowing this costs the site nothing.
drop policy if exists "Public read tournaments" on public.tournaments;
create policy "Public read tournaments"
  on public.tournaments
  for select
  using (is_draft = false);
