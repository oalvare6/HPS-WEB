-- D7, first half: an open-play night can name the tournaments that get in free.
--
-- ## Why this is configuration and not a rule
--
-- REBUILD-PLAN D7 states it as "free if they are on an active tournament
-- roster". Taken literally that is a standing rule with no off switch: the day
-- somebody creates a fourth tournament, every player on it starts walking into
-- Friday nights free and nobody decided that. The owner asked for the opposite —
-- he picks, per night, which tournaments qualify. Tonight's answer is "Community
-- Cup"; next month's might be nothing at all.
--
-- So the entitlement lives on the *open-play event*, not on the tournament that
-- confers it, and it is a list the organiser fills in each time.
--
-- ## Why a uuid[] and not a join table
--
-- A join table would give referential integrity and would be the textbook
-- answer. It would also be a fifth table for what is, in practice, one row with
-- two or three ids in it, plus its own admin CRUD for a non-technical owner to
-- learn. The array cannot go stale in a harmful direction: an id pointing at a
-- deleted tournament simply matches no registration, so the failure mode is
-- "nobody gets in free", which is the safe one. Empty default means every event
-- that exists today keeps charging exactly what it charges today.
--
-- ## What this column may never become
--
-- It is *not* a money gate on its own and it is not read by anything that
-- decides whether an event sells. `acceptsRegistrations()` / `acceptsPayments()`
-- in tournament-state.ts still decide that, for open play exactly as for
-- tournaments. This column only ever answers "does this person owe the door
-- price", and only after those gates have already said yes.

alter table public.tournaments
  add column if not exists free_entry_tournament_ids uuid[] not null default '{}';

comment on column public.tournaments.free_entry_tournament_ids is
  'Open play only (D7). Tournament ids whose active, team-assigned players get in free to THIS night. Chosen by the organiser per event — never inherited, never automatic. Empty (the default) means everybody pays the door price. Deliberately a uuid[] with no FK: a stale id matches no registration, so the failure mode is "nobody is comped", not "somebody is comped by accident". Evaluate it only through resolveOpenPlayEntitlement() in src/lib/open-play-free-entry.ts — a client-supplied "I am free" flag is a free-entry vulnerability.';
