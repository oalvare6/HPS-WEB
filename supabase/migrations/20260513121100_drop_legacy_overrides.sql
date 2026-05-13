-- Drop the legacy league_round_overrides table. It was replaced by
-- public.tournament_rounds and is no longer read or written by the app.
--
-- This is intentionally a separate migration so it can be reviewed and
-- delayed if you want to keep the data around as a safety net.

drop trigger if exists league_round_overrides_set_updated_at on public.league_round_overrides;
drop table if exists public.league_round_overrides;
drop function if exists public.set_updated_at_round_overrides();
