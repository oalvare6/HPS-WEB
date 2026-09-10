-- ============================================================================
-- STAGE 2.2 — synthetic development seed for the isolated `hps-dev` project.
-- ============================================================================
--
-- Everything here is fictional: reserved `example.com` addresses and 555-01xx
-- phone numbers, which can never reach a real person. No production row was
-- read to build it.
--
-- WHY THIS REFUSES TO RUN ANYWHERE ELSE
--
-- A seed script is the most dangerous file in a repository: it writes. The
-- usual guard is a connection string the operator is trusted to get right,
-- which is no guard at all — it fails exactly when someone is tired and pasting
-- the wrong URI. So this script asks the *database* to prove its identity:
-- `site_settings['stage22.dev_project_ref']` must exist and name the approved
-- development project. Production has no such row and never will, so pointing
-- this file at Production raises before it writes anything.
--
-- SCOPED, RE-RUNNABLE, AND IT NEVER TRUNCATES
--
-- Every row it creates carries the run prefix below in a slug, an email or a
-- team name. Re-running deletes only rows matching that prefix and rebuilds
-- them. Nothing outside the prefix is touched: no truncate, no schema reset, no
-- delete of anything this script did not create (docs/STAGE-2-2-SETUP-CHECKLIST.md §4).
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
-- It does not save the completed result used to prove the result-entry
-- workflow. That has to go through `save_match_result` so the RPC is what is
-- being tested, not the seed (checklist §4). It leaves the past fixture waiting
-- for a score on purpose.
--
-- Run:  psql "$HPS_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/stage22-seed.sql
-- ============================================================================

\set ON_ERROR_STOP on

do $seed$
declare
  -- The only project this file may write to.
  c_expected_ref constant text := 'tfkdtwgxnumnuiiayrld';
  c_run          constant text := 'stage22';
  v_actual_ref   text;

  v_main uuid; v_empty uuid; v_overlap uuid; v_openplay uuid;
  v_team_a uuid; v_team_b uuid;
  v_r1 uuid; v_r2 uuid; v_semi uuid; v_cancelled uuid; v_undated uuid;
  v_m_past uuid; v_m_next uuid; v_m_postponed uuid; v_m_cancelled uuid;
  v_m_undated uuid; v_m_semi uuid;
  v_contact uuid; v_reg uuid;
  v_ids uuid[] := '{}';
  v_regs uuid[] := '{}';
  i int;
  v_status text; v_type text; v_wtype text;
begin
  ---------------------------------------------------------------------------
  -- 0. Prove the database is the approved development project.
  ---------------------------------------------------------------------------
  select value #>> '{}' into v_actual_ref
    from public.site_settings where key = 'stage22.dev_project_ref';

  if v_actual_ref is null then
    raise exception
      'Refusing to seed: this database carries no stage22.dev_project_ref marker, so it is not the approved hps-dev project.';
  end if;
  if v_actual_ref <> c_expected_ref then
    raise exception
      'Refusing to seed: this database identifies as %, but the approved Stage 2.2 target is %.',
      v_actual_ref, c_expected_ref;
  end if;
  raise notice 'Target confirmed: % — seeding run prefix %', v_actual_ref, c_run;

  ---------------------------------------------------------------------------
  -- 1. Remove only what a previous run of THIS prefix created.
  --    Order matters: children before parents. Cascades do the rest.
  ---------------------------------------------------------------------------
  delete from public.payments where email like c_run || '-%@example.com';
  delete from public.registrations
   where tournament_id in (select id from public.tournaments where slug like c_run || '-%');
  delete from public.tournaments where slug like c_run || '-%';
  delete from public.contacts where email like c_run || '-%@example.com';

  ---------------------------------------------------------------------------
  -- 2. Four events. Stored columns are written exactly as storedColumnsFor()
  --    in src/lib/tournament-state.ts would write them for state = 'open':
  --    is_draft false, registration_open true, payments_open true, and a
  --    status derived from the dates (ongoing once the first day has passed).
  ---------------------------------------------------------------------------
  insert into public.tournaments
    (title, slug, kind, status, is_draft, registration_open, payments_open,
     start_date, end_date, location, format, entry_fee_cents, max_teams, display_order, description)
  values
    (c_run || ' Main Cup', c_run || '-main-cup', 'tournament', 'ongoing', false, true, true,
     '2026-09-05', '2026-10-15', 'Synthetic Field 1', '7v7', 5000, 8, 1,
     'Populated synthetic event: 12 players, two teams, a schedule and a fixture awaiting a result.')
  returning id into v_main;

  insert into public.tournaments
    (title, slug, kind, status, is_draft, registration_open, payments_open,
     start_date, end_date, location, entry_fee_cents, display_order, description)
  values
    (c_run || ' Empty Cup', c_run || '-empty-cup', 'tournament', 'upcoming', false, true, true,
     '2026-11-01', '2026-11-30', 'Synthetic Field 2', 5000, 2,
     'Deliberately empty: an empty roster must be distinguishable from a failed load.')
  returning id into v_empty;

  insert into public.tournaments
    (title, slug, kind, status, is_draft, registration_open, payments_open,
     start_date, end_date, location, entry_fee_cents, display_order, description)
  values
    (c_run || ' Overlap Cup', c_run || '-overlap-cup', 'tournament', 'ongoing', false, true, true,
     '2026-09-01', '2026-10-01', 'Synthetic Field 3', 4000, 3,
     'Shares people with the Main Cup so identical names across events can be told apart.')
  returning id into v_overlap;

  insert into public.tournaments
    (title, slug, kind, status, is_draft, registration_open, payments_open,
     start_date, end_date, location, drop_in_fee_cents, display_order,
     free_entry_tournament_ids, description)
  values
    (c_run || ' Open Play', c_run || '-open-play', 'open_play', 'upcoming', false, true, true,
     '2026-09-18', '2026-09-18', 'Synthetic Gym', 2000, 4,
     array[v_main], 'One night. Main Cup players get in free (D7); everyone else pays the door.')
  returning id into v_openplay;

  ---------------------------------------------------------------------------
  -- 3. Twelve people on the Main Cup.
  --
  --    The documented split (checklist §4): 5 paid, 2 waived/free, 3 pending,
  --    1 partial, 1 refunded. Paid and waived both count as financially
  --    accounted for — the roster route's SETTLED set is {paid, waived} — so
  --    the expected reading is 7 accounted for and 5 outstanding. Partial and
  --    refunded stay separately identifiable; they are not "never paid".
  ---------------------------------------------------------------------------
  for i in 1..12 loop
    v_status := case
                  when i <= 5  then 'paid'
                  when i <= 7  then 'waived'
                  when i <= 10 then 'pending'
                  when i = 11  then 'partial'
                  else 'refunded'
                end;
    -- Two youth cases, so guardian handling is exercised.
    v_type  := case when i >= 11 then 'youth' else 'adult' end;
    v_wtype := v_type;

    insert into public.contacts
      (first_name, last_name, email, phone, dob,
       emergency_name, emergency_phone, tags, marketing_opt_in)
    values (
      'Player' || i,
      'Synthetic',
      (c_run || '-player' || i || '@example.com')::citext,
      -- Player 9 has no phone on file: an absent optional field, not a failure.
      case when i = 9 then null else '555-01' || lpad(i::text, 2, '0') end,
      case when i >= 11 then date '2012-04-15' else date '1995-06-20' end,
      -- Player 8 is missing emergency details entirely.
      case when i = 8 then null else 'Emergency' || i end,
      case when i = 8 then null else '555-02' || lpad(i::text, 2, '0') end,
      array['stage22', 'synthetic'],
      true
    )
    returning id into v_contact;
    v_ids := v_ids || v_contact;

    insert into public.registrations
      (registration_type, first_name, last_name, email, phone, dob,
       emergency_name, emergency_phone, waiver_type, payment_status,
       tournament_id, contact_id, needs_admin_review, notes)
    values (
      v_type, 'Player' || i, 'Synthetic',
      c_run || '-player' || i || '@example.com',
      '555-01' || lpad(i::text, 2, '0'),
      case when i >= 11 then date '2012-04-15' else date '1995-06-20' end,
      coalesce(case when i = 8 then null else 'Emergency' || i end, 'Not provided'),
      coalesce(case when i = 8 then null else '555-02' || lpad(i::text, 2, '0') end, 'Not provided'),
      v_wtype, v_status, v_main, v_contact,
      -- Player 10 carries the review flag. The roster payload supplies a flag
      -- and no reason; the UI must not invent one.
      (i = 10),
      case when i >= 11 then 'Youth registration; guardian Guardian' || i || ' Synthetic (555-03' || lpad(i::text,2,'0') || ').' else null end
    )
    returning id into v_reg;
    v_regs := v_regs || v_reg;
  end loop;

  ---------------------------------------------------------------------------
  -- 4. Waiver coverage, deliberately uneven.
  --
  --    waiverStatusFor() in src/lib/admin-roster.ts decides display, and the
  --    operator's 2026-08-17 policy is that a covered person is a green tick
  --    whatever the paper trail. These rows exercise every branch it has:
  --    a real in-app signature, an expired one, coverage with no document,
  --    an admin override, and nothing at all.
  ---------------------------------------------------------------------------
  -- Players 1-8: genuine in-app signatures with a producible record.
  for i in 1..8 loop
    update public.contacts
       set waiver_type = case when i >= 11 then 'youth' else 'adult' end,
           waiver_signed_at = now() - interval '10 days',
           waiver_expires_at = now() + interval '355 days',
           waiver_source = 'in_app',
           waiver_document_url = null
     where id = v_ids[i];

    insert into public.waiver_signatures
      (registration_id, contact_id, waiver_type, signed_name, signed_at,
       signer_relationship, ip, user_agent, waiver_version)
    values (v_regs[i], v_ids[i], 'adult', 'Player' || i || ' Synthetic',
            now() - interval '10 days', null, '203.0.113.10'::inet,
            'stage22-seed/synthetic', 'v1');

    update public.registrations
       set waiver_signed = true, waiver_signed_at = now() - interval '10 days'
     where id = v_regs[i];
  end loop;

  -- Player 9: EXPIRED coverage. Must read as needing a waiver, not as covered.
  update public.contacts
     set waiver_type = 'adult',
         waiver_signed_at = now() - interval '400 days',
         waiver_expires_at = now() - interval '35 days',
         waiver_source = 'in_app'
   where id = v_ids[9];

  -- Player 10: imported legacy evidence with NO document. Covered, but the
  -- missing document is a quiet tag — never "needs waiver".
  update public.contacts
     set waiver_type = 'adult',
         waiver_signed_at = now() - interval '60 days',
         waiver_expires_at = now() + interval '305 days',
         waiver_source = 'import',
         waiver_document_url = null
   where id = v_ids[10];

  -- Player 11: admin override. Covered, evidence = 'override'.
  update public.contacts
     set waiver_type = 'youth',
         waiver_signed_at = now() - interval '5 days',
         waiver_expires_at = now() + interval '360 days',
         waiver_source = 'admin_override'
   where id = v_ids[11];

  -- Player 12: no waiver anywhere. Genuinely missing.

  ---------------------------------------------------------------------------
  -- 5. Two teams, captains, assigned and unassigned players.
  --    Players 9-12 stay unassigned so the roster's unassigned count is real.
  ---------------------------------------------------------------------------
  insert into public.teams (tournament_id, name, captain_contact_id, color)
  values (v_main, c_run || ' Rojos', v_ids[1], '#c0392b') returning id into v_team_a;
  insert into public.teams (tournament_id, name, captain_contact_id, color)
  values (v_main, c_run || ' Azules', v_ids[5], '#2980b9') returning id into v_team_b;

  for i in 1..4 loop
    update public.registrations set team_id = v_team_a where id = v_regs[i];
    insert into public.team_members (team_id, contact_id, role)
    values (v_team_a, v_ids[i], case when i = 1 then 'captain' else 'player' end)
    on conflict do nothing;
  end loop;
  for i in 5..8 loop
    update public.registrations set team_id = v_team_b where id = v_regs[i];
    insert into public.team_members (team_id, contact_id, role)
    values (v_team_b, v_ids[i], case when i = 5 then 'captain' else 'player' end)
    on conflict do nothing;
  end loop;

  ---------------------------------------------------------------------------
  -- 6. Rounds. counts_toward_table is false for the semi-final: computeStandings
  --    requires the rounds precisely so this cannot be forgotten.
  ---------------------------------------------------------------------------
  insert into public.tournament_rounds (tournament_id, label, round_date, status, sort_order, counts_toward_table)
  values (v_main, 'Week 1', date '2026-09-05', 'scheduled', 1, true) returning id into v_r1;
  insert into public.tournament_rounds (tournament_id, label, round_date, status, sort_order, counts_toward_table)
  values (v_main, 'Week 2', date '2026-09-12', 'scheduled', 2, true) returning id into v_r2;
  insert into public.tournament_rounds (tournament_id, label, round_date, status, sort_order, counts_toward_table, note)
  values (v_main, 'Semi-finals', date '2026-10-01', 'scheduled', 3, false, 'Knockout: excluded from the table.') returning id into v_semi;
  insert into public.tournament_rounds (tournament_id, label, round_date, status, sort_order, counts_toward_table, note)
  values (v_main, 'Week 3', date '2026-09-19', 'cancelled', 4, true, 'Cancelled: pitch flooded.') returning id into v_cancelled;
  insert into public.tournament_rounds (tournament_id, label, round_date, status, sort_order, counts_toward_table)
  values (v_main, 'Date to be confirmed', null, 'scheduled', 5, true) returning id into v_undated;

  ---------------------------------------------------------------------------
  -- 7. Fixtures. The Week 1 match is left WITHOUT a score on purpose: it is the
  --    past fixture awaiting a result, and the result-entry proof must go
  --    through save_match_result rather than being seeded here.
  ---------------------------------------------------------------------------
  insert into public.matches (tournament_id, round_id, match_number, home_team_id, away_team_id, match_date, kickoff_time, status, sort_order)
  values (v_main, v_r1, 1, v_team_a, v_team_b, date '2026-09-05', '19:00', 'scheduled', 1) returning id into v_m_past;
  insert into public.matches (tournament_id, round_id, match_number, home_team_id, away_team_id, match_date, kickoff_time, status, sort_order)
  values (v_main, v_r2, 2, v_team_b, v_team_a, date '2026-09-12', '19:00', 'scheduled', 2) returning id into v_m_next;
  insert into public.matches (tournament_id, round_id, match_number, home_team_id, away_team_id, match_date, status, sort_order, notes)
  values (v_main, v_r2, 3, v_team_a, v_team_b, date '2026-09-13', 'postponed', 3, 'Postponed: referee unavailable.') returning id into v_m_postponed;
  insert into public.matches (tournament_id, round_id, match_number, home_team_id, away_team_id, match_date, status, sort_order)
  values (v_main, v_cancelled, 4, v_team_a, v_team_b, date '2026-09-19', 'cancelled', 4) returning id into v_m_cancelled;
  insert into public.matches (tournament_id, round_id, match_number, home_team_id, away_team_id, match_date, status, sort_order)
  values (v_main, v_undated, 5, v_team_b, v_team_a, null, 'scheduled', 5) returning id into v_m_undated;
  insert into public.matches (tournament_id, round_id, match_number, home_team_id, away_team_id, match_date, status, sort_order)
  values (v_main, v_semi, 6, v_team_a, v_team_b, date '2026-10-01', 'scheduled', 6) returning id into v_m_semi;

  ---------------------------------------------------------------------------
  -- 8. Payment ledger rows for the five paid players.
  --
  --    These are development fixtures, NOT Stripe receipts. Nothing here proves
  --    a card was charged or a webhook delivered. The session ids are
  --    unmistakably synthetic and must never be sent to a provider. This is
  --    also the one part of the dataset no application route can produce:
  --    /api/admin/payments is GET-only and nothing in src/ inserts a payment
  --    outside finalize_checkout_payment.
  ---------------------------------------------------------------------------
  for i in 1..5 loop
    insert into public.payments
      (registration_id, contact_id, tournament_id, email, amount, currency,
       tournament_name, stripe_session_id, status, notes)
    values (v_regs[i], v_ids[i], v_main,
            c_run || '-player' || i || '@example.com', 50.00, 'usd',
            c_run || ' Main Cup',
            'cs_SYNTHETIC_' || c_run || '_' || i,
            'succeeded',
            'Synthetic Stage 2.2 development fixture. Not a real payment.');
  end loop;

  ---------------------------------------------------------------------------
  -- 9. Overlap event: the SAME two people, so identical names in two events can
  --    be told apart by id rather than by label.
  ---------------------------------------------------------------------------
  for i in 1..2 loop
    insert into public.registrations
      (registration_type, first_name, last_name, email, phone, dob,
       emergency_name, emergency_phone, waiver_type, payment_status,
       tournament_id, contact_id)
    values ('adult', 'Player' || i, 'Synthetic',
            c_run || '-player' || i || '@example.com',
            '555-01' || lpad(i::text, 2, '0'), date '1995-06-20',
            'Emergency' || i, '555-02' || lpad(i::text, 2, '0'),
            'adult', case when i = 1 then 'paid' else 'pending' end,
            v_overlap, v_ids[i]);
  end loop;

  ---------------------------------------------------------------------------
  -- 10. Open play: one comped by the Main Cup (D7), one paying the door.
  --     free_entry_tournament_id records WHICH event bought the comp, at the
  --     moment of confirming — the answer must not change when the config does.
  ---------------------------------------------------------------------------
  insert into public.registrations
    (registration_type, first_name, last_name, email, phone, dob,
     emergency_name, emergency_phone, waiver_type, payment_status,
     tournament_id, contact_id, free_entry_tournament_id)
  values ('adult', 'Player3', 'Synthetic', c_run || '-player3@example.com',
          '555-0103', date '1995-06-20', 'Emergency3', '555-0203',
          'adult', 'waived', v_openplay, v_ids[3], v_main);

  insert into public.registrations
    (registration_type, first_name, last_name, email, phone, dob,
     emergency_name, emergency_phone, waiver_type, payment_status,
     tournament_id, contact_id)
  values ('adult', 'Player9', 'Synthetic', c_run || '-player9@example.com',
          '555-0109', date '1995-06-20', 'Emergency9', '555-0209',
          'adult', 'pending', v_openplay, v_ids[9]);

  raise notice 'Seed complete. main=% empty=% overlap=% openplay=%', v_main, v_empty, v_overlap, v_openplay;
  raise notice 'teams: A=% B=%   past fixture awaiting result=%', v_team_a, v_team_b, v_m_past;
end
$seed$;

-- The manifest: every synthetic row this run owns, by id.
select 'tournament' as kind, id::text, slug as label from public.tournaments where slug like 'stage22-%'
union all
select 'team', id::text, name from public.teams where name like 'stage22 %'
union all
select 'contact', id::text, email::text from public.contacts where email::text like 'stage22-%@example.com'
union all
select 'registration', r.id::text, r.email || ' @ ' || t.slug
  from public.registrations r join public.tournaments t on t.id = r.tournament_id
 where t.slug like 'stage22-%'
union all
select 'payment', id::text, stripe_session_id from public.payments where stripe_session_id like 'cs_SYNTHETIC_stage22_%'
order by 1, 3;
