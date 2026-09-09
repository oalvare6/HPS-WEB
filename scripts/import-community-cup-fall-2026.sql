-- One-off import of the operator's "Community Cup - Fall 2026" spreadsheet
-- (Schedule tab, 2026-09-08): 10 rounds, 25 matches, the six played results
-- with scorers. Run once against production through the Supabase SQL editor or
-- the MCP tool AFTER 20260908120000_round_counts_and_scorer_identity.sql.
--
-- Safe to re-run: rounds are matched by label, matches by match_number and
-- UPDATED IN PLACE (the three placeholder Round 1 rows the owner created become
-- matches 1-3 of the sheet). There is no `delete from matches` anywhere in this
-- file. The only deletes are the scorer rows of the five matches whose results
-- this file supplies, so a second run does not double the goals.
--
-- Decisions baked in (see docs/SESSION-LOG-2026-09-08-COMMUNITY-CUP.md):
--   * Each goal is credited to the team whose match line it appears in. The
--     sheet's own scoring list disagrees for three players and the site
--     follows the match line: Brandon Bricker on Hiram Clarke (list: Bellaire),
--     Jose Chavarria on Bellaire (list: Beltway), Tony on Hiram Clarke (list:
--     Post Oak). The owner confirms or fixes these in admin.
--   * Match 5's goal lines are swapped on the sheet; the 3-10 score is right.
--   * Roster spellings win where a roster row exists: Jesse Pecero (sheet
--     "Pacero"), Erik Tello ("Eric"), Dilver Benitez ("Gilbert"), Salvador
--     Castro ("Chava"), Kelvin Cardona ("Kevin" in match 2).
--   * Unknown surnames go in as plain first names: Tony, Antonio, Bryan.
--   * "Beltway FC" on the sheet is the team the owner created as "S. Beltway FC".
--   * An own goal is a row on the BENEFITING team with own_goal = true.

do $$
declare
  t constant uuid := '5bb92b95-73f4-4e25-93dc-bd7caebcd743';
  team_po uuid; team_tw uuid; team_hc uuid; team_tn uuid; team_bw uuid; team_be uuid;
  rec record;
  rid uuid;
  mid uuid;
  home_id uuid; away_id uuid;
begin
  select id into team_po from public.teams where tournament_id = t and lower(name) = 'post oak fc';
  select id into team_tw from public.teams where tournament_id = t and lower(name) = '3rd ward fc';
  select id into team_hc from public.teams where tournament_id = t and lower(name) = 'hiram clarke fc';
  select id into team_tn from public.teams where tournament_id = t and lower(name) = 'townwood fc';
  select id into team_bw from public.teams where tournament_id = t and lower(name) = 's. beltway fc';
  select id into team_be from public.teams where tournament_id = t and lower(name) = 'bellaire fc';
  if team_po is null or team_tw is null or team_hc is null or team_tn is null or team_bw is null or team_be is null then
    raise exception 'One of the six Community Cup teams is missing. Nothing written.';
  end if;

  -- 3rd Ward FC has no colour; every other team does.
  update public.teams set color = '#f97316' where id = team_tw and color is null;

  -- Rounds: update by label, insert if missing. sort_order is explicit because
  -- Semi-Final and Exhibition share Oct 16.
  for rec in
    select * from (values
      ('Round 1',    date '2026-08-21', 1,  true),
      ('Round 2',    date '2026-08-28', 2,  true),
      ('Round 3',    date '2026-09-11', 3,  true),
      ('Round 4',    date '2026-09-18', 4,  true),
      ('Round 5',    date '2026-09-25', 5,  true),
      ('Round 6',    date '2026-10-02', 6,  true),
      ('Round 7',    date '2026-10-09', 7,  true),
      ('Semi-Final', date '2026-10-16', 8,  false),
      ('Exhibition', date '2026-10-16', 9,  false),
      ('Final',      date '2026-10-23', 10, false)
    ) as v(label, round_date, sort_order, counts)
  loop
    update public.tournament_rounds
       set round_date = rec.round_date,
           time_start = coalesce(time_start, '7:00 PM'),
           sort_order = rec.sort_order,
           counts_toward_table = rec.counts,
           status = case when status = 'note' then 'scheduled' else status end
     where tournament_id = t and lower(label) = lower(rec.label);
    if not found then
      insert into public.tournament_rounds
        (tournament_id, label, round_date, time_start, status, sort_order, counts_toward_table)
      values (t, rec.label, rec.round_date, '7:00 PM', 'scheduled', rec.sort_order, rec.counts);
    end if;
  end loop;

  -- Matches: update by match_number, insert if missing. sort_order = match
  -- number so the currently deployed page (which orders by sort_order) reads
  -- correctly until the new code ships.
  for rec in
    select * from (values
      ( 1, 'Round 1',    '7:00 PM', 'bw', 'be', null, null, 'postponed', null, null, 'Will be made up in September'),
      ( 2, 'Round 1',    '7:20 PM', 'po', 'tw', null, null, 'completed', 8, 3, null),
      ( 3, 'Round 1',    '9:00 PM', 'tn', 'hc', null, null, 'completed', 3, 9, null),
      ( 4, 'Round 2',    '7:00 PM', 'be', 'tw', null, null, 'completed', 2, 10, null),
      ( 5, 'Round 2',    '8:00 PM', 'tn', 'po', null, null, 'completed', 3, 10, null),
      ( 6, 'Round 2',    '9:00 PM', 'bw', 'hc', null, null, 'completed', 2, 9, null),
      ( 7, 'Round 3',    '7:00 PM', 'hc', 'po', null, null, 'scheduled', null, null, null),
      ( 8, 'Round 3',    '8:00 PM', 'be', 'tn', null, null, 'scheduled', null, null, null),
      ( 9, 'Round 3',    '9:00 PM', 'tw', 'bw', null, null, 'scheduled', null, null, null),
      (10, 'Round 4',    '7:00 PM', 'hc', 'be', null, null, 'scheduled', null, null, null),
      (11, 'Round 4',    '8:00 PM', 'po', 'bw', null, null, 'scheduled', null, null, null),
      (12, 'Round 4',    '9:00 PM', 'tw', 'tn', null, null, 'scheduled', null, null, null),
      (13, 'Round 5',    '7:00 PM', 'po', 'be', null, null, 'scheduled', null, null, null),
      (14, 'Round 5',    '8:00 PM', 'hc', 'tw', null, null, 'scheduled', null, null, null),
      (15, 'Round 5',    '9:00 PM', 'tn', 'bw', null, null, 'scheduled', null, null, null),
      (16, 'Round 6',    '7:00 PM', 'hc', 'tn', null, null, 'scheduled', null, null, null),
      (17, 'Round 6',    '8:00 PM', 'be', 'bw', null, null, 'scheduled', null, null, null),
      (18, 'Round 6',    '9:00 PM', 'tw', 'po', null, null, 'scheduled', null, null, null),
      (19, 'Round 7',    '7:00 PM', 'hc', 'bw', null, null, 'scheduled', null, null, null),
      (20, 'Round 7',    '8:00 PM', 'tw', 'be', null, null, 'scheduled', null, null, null),
      (21, 'Round 7',    '9:00 PM', 'po', 'tn', null, null, 'scheduled', null, null, null),
      (22, 'Semi-Final', '7:00 PM', null, null, '1st place', '4th place', 'scheduled', null, null, null),
      (23, 'Semi-Final', '8:00 PM', null, null, '2nd place', '3rd place', 'scheduled', null, null, null),
      (24, 'Exhibition', '9:00 PM', null, null, '5th place', '6th place', 'scheduled', null, null, null),
      (25, 'Final',      '8:00 PM', null, null, 'Winner SF1', 'Winner SF2', 'scheduled', null, null, null)
    ) as v(n, round_label, kickoff, home, away, home_label, away_label, status, hs, ascore, note)
  loop
    select id into rid from public.tournament_rounds
     where tournament_id = t and lower(label) = lower(rec.round_label);
    home_id := case rec.home when 'po' then team_po when 'tw' then team_tw when 'hc' then team_hc
                             when 'tn' then team_tn when 'bw' then team_bw when 'be' then team_be end;
    away_id := case rec.away when 'po' then team_po when 'tw' then team_tw when 'hc' then team_hc
                             when 'tn' then team_tn when 'bw' then team_bw when 'be' then team_be end;

    update public.matches
       set round_id = rid,
           home_team_id = home_id,
           away_team_id = away_id,
           home_team_label = case when home_id is null then rec.home_label else null end,
           away_team_label = case when away_id is null then rec.away_label else null end,
           match_date = (select round_date from public.tournament_rounds where id = rid),
           kickoff_time = rec.kickoff,
           status = rec.status,
           home_score = rec.hs,
           away_score = rec.ascore,
           notes = rec.note,
           sort_order = rec.n
     where tournament_id = t and match_number = rec.n
     returning id into mid;
    if mid is null then
      insert into public.matches
        (tournament_id, round_id, match_number, home_team_id, away_team_id,
         home_team_label, away_team_label, match_date, kickoff_time, status,
         home_score, away_score, notes, sort_order)
      values
        (t, rid, rec.n, home_id, away_id,
         case when home_id is null then rec.home_label else null end,
         case when away_id is null then rec.away_label else null end,
         (select round_date from public.tournament_rounds where id = rid),
         rec.kickoff, rec.status, rec.hs, rec.ascore, rec.note, rec.n)
      returning id into mid;
    end if;
    mid := null;
  end loop;

  -- Scorers for the five played matches. Re-run safe: those five matches'
  -- scorer rows are rebuilt from this list; no other match is touched.
  delete from public.match_scorers
   where match_id in (select id from public.matches where tournament_id = t and match_number in (2, 3, 4, 5, 6));

  insert into public.match_scorers (match_id, team_id, scorer_name, goals, own_goal, contact_id, sort_order)
  select m.id,
         case v.side when 'home' then m.home_team_id else m.away_team_id end,
         v.scorer_name,
         v.goals,
         v.own_goal,
         case when v.own_goal then null else (
           select r.contact_id
             from public.registrations r
            where r.tournament_id = t
              and r.cancelled_at is null
              and r.team_id = case v.side when 'home' then m.home_team_id else m.away_team_id end
              and lower(btrim(r.first_name)) = lower(v.first_name)
              and lower(btrim(r.last_name)) = lower(v.last_name)
            order by r.created_at
            limit 1
         ) end,
         v.ord
    from (values
      -- match, side, display name, goals, own goal, roster first, roster last, order
      (2, 'home', 'Kelvin Cardona',    3, false, 'Kelvin',   'Cardona',   0),
      (2, 'home', 'Rene Cruz',         4, false, 'Rene',     'Cruz',      1),
      (2, 'home', 'Michael Gomez',     1, false, 'Michael',  'Gomez',     2),
      (2, 'away', 'Anthony Reyes',     1, false, 'Anthony',  'Reyes',     3),
      (2, 'away', 'Jacob Mashburn',    1, false, 'Jacob',    'Mashburn',  4),
      (2, 'away', 'Own goal',          1, true,  '',         '',          5),
      (3, 'home', 'Carlos Castellon',  3, false, 'Carlos',   'Castellon', 0),
      (3, 'away', 'William Franco',    2, false, 'William',  'Franco',    1),
      (3, 'away', 'Tony',              2, false, '',         '',          2),
      (3, 'away', 'Brandon Bricker',   3, false, 'Brandon',  'Bricker',   3),
      (3, 'away', 'Jan Carlos Galo',   1, false, 'Jan Carlos', 'Galo',    4),
      (3, 'away', 'Alexis "Chino"',    1, false, '',         '',          5),
      (4, 'home', 'Jose Chavarria',    2, false, 'Jose',     'Chavarria', 0),
      (4, 'away', 'Jesse Pecero',      6, false, 'Jesse',    'Pecero',    1),
      (4, 'away', 'Alexis Reyes',      3, false, 'Alexis',   'Reyes',     2),
      (4, 'away', 'Anthony Reyes',     1, false, 'Anthony',  'Reyes',     3),
      (5, 'home', 'Gabriel Minero',    3, false, 'Gabriel',  'Minero',    0),
      (5, 'away', 'Kelvin Cardona',    5, false, 'Kelvin',   'Cardona',   1),
      (5, 'away', 'Dilver Benitez',    2, false, 'Dilver',   'Benitez',   2),
      (5, 'away', 'Rene Cruz',         1, false, 'Rene',     'Cruz',      3),
      (5, 'away', 'Luis Grande',       1, false, 'Luis',     'Grande',    4),
      (5, 'away', 'Erik Tello',        1, false, 'Erik',     'Tello',     5),
      (6, 'home', 'Salvador Castro',   1, false, 'Salvador', 'Castro',    0),
      (6, 'home', 'Alejandro Plazaola',1, false, 'Alejandro','Plazaola',  1),
      (6, 'away', 'William Franco',    3, false, 'William',  'Franco',    2),
      (6, 'away', 'Jan Carlos Galo',   2, false, 'Jan Carlos', 'Galo',    3),
      (6, 'away', 'Joshua Lockhart',   1, false, 'Joshua',   'Lockhart',  4),
      (6, 'away', 'Antonio',           1, false, '',         '',          5),
      (6, 'away', 'Bryan',             1, false, '',         '',          6),
      (6, 'away', 'Own goal',          1, true,  '',         '',          7)
    ) as v(n, side, scorer_name, goals, own_goal, first_name, last_name, ord)
    join public.matches m on m.tournament_id = t and m.match_number = v.n;
end $$;

-- Verification (expected after the import):
--   Table: Hiram Clarke 6 pts 18/5 +13 · Post Oak 6 pts 18/6 +12 · 3rd Ward 3 pts 13/10 +3
--          · S. Beltway 0 2/9 -7 · Bellaire 0 2/10 -8 · Townwood 0 6/19 -13
--   Scorers: Kelvin Cardona 8, Jesse Pecero 6, William Franco 5, Rene Cruz 5
--
-- select tr.label, m.match_number, coalesce(ht.name, m.home_team_label) home, m.home_score, m.away_score,
--        coalesce(at.name, m.away_team_label) away, m.status
--   from matches m join tournament_rounds tr on tr.id = m.round_id
--   left join teams ht on ht.id = m.home_team_id left join teams at on at.id = m.away_team_id
--  where m.tournament_id = '5bb92b95-73f4-4e25-93dc-bd7caebcd743' order by m.match_number;
