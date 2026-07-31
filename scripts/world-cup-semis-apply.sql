-- World Cup: apply the July 24 semis sheet to the live DB in one transaction.
--
-- This is a convenience artifact for the Supabase SQL editor. The canonical
-- source is scripts/seed-world-cup-schedule.mjs; this file was generated from
-- it and matches it exactly. If you can run node, prefer:
--   node --env-file=.env.local scripts/seed-world-cup-schedule.mjs
--
-- Prerequisite: migration 20260731090000_add_match_advanced_team.sql (adds
-- matches.advanced_team_id) must already be applied.
--
-- Safe to re-run: it clears this tournament's matches (scorers cascade) and
-- rebuilds all 24 from scratch. Everything resolves by name/slug, so no UUIDs
-- are hardcoded. Wrapped in a transaction — it all lands or none of it does.

begin;
delete from matches where tournament_id=(select id from tournaments where slug='world-cup-summer-tournament');
insert into matches (tournament_id,round_id,match_number,home_team_id,away_team_id,home_team_label,away_team_label,match_date,kickoff_time,status,home_score,away_score,notes,advanced_team_id,sort_order)
select t.id,r.id,v.n,ht.id,at.id,case when ht.id is null then v.hl end,case when at.id is null then v.al end,r.round_date,v.tm,v.st,v.hs,v.sc,v.note,adv.id,v.so
from (values
(1,'Round 1','7:00 PM','Brazil','USA',null,null,'cancelled',null,null,'Not played — replayed in Round 6 for double points',null,0),
(2,'Round 1','8:00 PM','Mexico','Kazakhstan',null,null,'completed',5,5,null,null,1),
(3,'Round 1','9:00 PM','Morocco','India',null,null,'completed',6,11,null,null,2),
(4,'Round 2','7:00 PM','Brazil','Mexico',null,null,'completed',3,4,null,null,3),
(5,'Round 2','8:00 PM','USA','Morocco',null,null,'completed',5,3,null,null,4),
(6,'Round 2','9:00 PM','Kazakhstan','India',null,null,'completed',2,6,null,null,5),
(7,'Round 3','7:00 PM','Brazil','Morocco',null,null,'completed',2,8,null,null,6),
(8,'Round 3','8:00 PM','USA','Kazakhstan',null,null,'completed',9,3,null,null,7),
(9,'Round 3','9:00 PM','Mexico','India',null,null,'completed',1,9,null,null,8),
(10,'Round 4','7:00 PM','Brazil','Kazakhstan',null,null,'completed',3,0,'Kazakhstan forfeit (technical score)',null,9),
(11,'Round 4','8:00 PM','USA','India',null,null,'completed',3,7,null,null,10),
(12,'Round 4','9:00 PM','Mexico','Morocco',null,null,'completed',7,5,null,null,11),
(13,'Round 5','7:00 PM','Brazil','India',null,null,'completed',10,3,null,null,12),
(14,'Round 5','8:00 PM','USA','Mexico',null,null,'completed',4,2,null,null,13),
(15,'Round 5','9:00 PM','Morocco','Kazakhstan',null,null,'completed',3,0,'Kazakhstan forfeit (technical score)',null,14),
(16,'Round 6','7:00 PM','Brazil','USA',null,null,'completed',6,6,'Round 1 make-up — played for double points',null,15),
(17,'Round 6','8:00 PM','Mexico','Morocco',null,null,'completed',2,5,null,null,16),
(18,'Round 6','9:00 PM','India','Kazakhstan',null,null,'completed',2,4,null,null,17),
(19,'Round 7','7:00 PM','Brazil','Mexico',null,null,'completed',7,6,null,null,18),
(20,'Round 7','8:00 PM','India','Morocco',null,null,'completed',3,9,null,null,19),
(21,'Round 7','9:00 PM','USA','Kazakhstan',null,null,'completed',1,9,null,null,20),
(22,'Semi-Finals','7:00 PM','Morocco','USA',null,null,'completed',6,6,'Morocco advanced after 6-6 draw','Morocco',21),
(23,'Semi-Finals','8:10 PM','India','Brazil',null,null,'completed',5,2,null,null,22),
(24,'Final','7:30 PM','Morocco','India',null,null,'scheduled',null,null,null,null,23)
) as v(n,rnd,tm,home,away,hl,al,st,hs,sc,note,adv,so)
join tournaments t on t.slug='world-cup-summer-tournament'
join tournament_rounds r on r.tournament_id=t.id and lower(r.label)=lower(v.rnd)
left join teams ht on ht.tournament_id=t.id and lower(ht.name)=lower(v.home)
left join teams at on at.tournament_id=t.id and lower(at.name)=lower(v.away)
left join teams adv on adv.tournament_id=t.id and lower(adv.name)=lower(v.adv);
insert into match_scorers (match_id,team_id,scorer_name,goals,sort_order)
select m.id,tm.id,v.nm,v.g,v.so
from (values
(2,'Mexico','Alejandro',1,0),
(2,'Mexico','Jason',3,1),
(2,'Mexico','Jesus',1,2),
(2,'Kazakhstan','Jacob',2,3),
(2,'Kazakhstan','OmarA',1,4),
(2,'Kazakhstan','Alan',1,5),
(2,'Kazakhstan','Jesse',1,6),
(3,'Morocco','Josh',4,0),
(3,'Morocco','JC',2,1),
(3,'India','Daniel',6,2),
(3,'India','Mahnek',2,3),
(3,'India','Gahvin',3,4),
(4,'Brazil','Ethan',1,0),
(4,'Brazil','Alex',2,1),
(4,'Mexico','Alejandro',2,2),
(4,'Mexico','Sergio',1,3),
(4,'Mexico','Chava',1,4),
(5,'USA','Will',1,0),
(5,'USA','Evan',2,1),
(5,'USA','Jason',3,2),
(5,'Morocco','JanC',1,3),
(5,'Morocco','Josh',1,4),
(5,'Morocco','Gilbert',1,5),
(6,'Kazakhstan','Jesse',2,0),
(6,'India','Daniel',2,1),
(6,'India','Mahnek',1,2),
(6,'India','Flyin',2,3),
(6,'India','Gahvin',1,4),
(7,'Brazil','Abu',1,0),
(7,'Brazil','Tony',1,1),
(7,'Morocco','Kelvin',3,2),
(7,'Morocco','William',2,3),
(7,'Morocco','Edgar',2,4),
(7,'Morocco','JanC',1,5),
(8,'USA','CarlosC',6,0),
(8,'USA','#6',1,1),
(8,'USA','#7',1,2),
(8,'Kazakhstan','#7',2,3),
(8,'Kazakhstan','#5',1,4),
(9,'Mexico','#3',1,0),
(9,'India','No#',2,1),
(9,'India','Shiv',1,2),
(9,'India','Mahnek',4,3),
(9,'India','Gahvin',2,4),
(11,'USA','Brandon',2,0),
(11,'USA','Eduardo',1,1),
(11,'India','Mahnek',4,2),
(11,'India','Daniel',1,3),
(11,'India','Gahvin',2,4),
(12,'Mexico','Alejandro',1,0),
(12,'Mexico','Emir',2,1),
(12,'Mexico','Chris',1,2),
(12,'Mexico','OG',2,3),
(12,'Morocco','Kelvin',2,4),
(12,'Morocco','Eduardo',1,5),
(12,'Morocco','Ethan',1,6),
(13,'Brazil','Ethan',3,0),
(13,'Brazil','Abu',3,1),
(13,'Brazil','Alex',1,2),
(13,'Brazil','Eidhan',1,3),
(13,'Brazil','Brandon',2,4),
(13,'India','Daniel',2,5),
(13,'India','Shiv',1,6),
(14,'USA','CarlosC',2,0),
(14,'USA','Jason',1,1),
(14,'USA','Evan',1,2),
(14,'Mexico','Julian',1,3),
(14,'Mexico','Emir',1,4),
(16,'Brazil','Ethan',2,0),
(16,'Brazil','Abu',2,1),
(16,'Brazil','Nathan',2,2),
(16,'USA','Evan',2,3),
(16,'USA','Adrian',2,4),
(16,'USA','CarlosF',1,5),
(16,'USA','Jason',1,6),
(17,'Mexico','Emir',1,0),
(17,'Mexico','Emiliano',1,1),
(17,'Morocco','Will',3,2),
(17,'Morocco','Kelvin',1,3),
(17,'Morocco','OmarA',1,4),
(18,'India','Mahnek',1,0),
(18,'India','Gahvin',1,1),
(18,'Kazakhstan','Yousef',2,2),
(18,'Kazakhstan','Jesse',1,3),
(18,'Kazakhstan','Alan',1,4),
(19,'Brazil','Nathan',3,0),
(19,'Brazil','Eduardo',2,1),
(19,'Brazil','Abu',1,2),
(19,'Brazil','Ethan',1,3),
(19,'Mexico','Alejandro',3,4),
(19,'Mexico','Jose',1,5),
(19,'Mexico','Julian',1,6),
(19,'Mexico','Emiliano',1,7),
(20,'India','Gahvin',2,0),
(20,'India','Mahnek',1,1),
(20,'Morocco','Kelvin',4,2),
(20,'Morocco','Will',3,3),
(20,'Morocco','OmarA',1,4),
(20,'Morocco','Oscar',1,5),
(21,'USA','David',1,0),
(21,'Kazakhstan','Jacob',3,1),
(21,'Kazakhstan','Alfonso',3,2),
(21,'Kazakhstan','Miguel',2,3),
(21,'Kazakhstan','OG',1,4),
(22,'Morocco','Kelvin',2,0),
(22,'Morocco','Will',3,1),
(22,'Morocco','Oscar',1,2),
(22,'USA','OmarV',2,3),
(22,'USA','Jason',2,4),
(22,'USA','CarlosC',1,5),
(22,'USA','Adrian',1,6),
(23,'India','Daniel',2,0),
(23,'India','Gahvin',1,1),
(23,'India','Armon',1,2),
(23,'India','Mahnek',1,3),
(23,'Brazil','Nathan',1,4),
(23,'Brazil','Alex',1,5)
) as v(n,team,nm,g,so)
join tournaments t on t.slug='world-cup-summer-tournament'
join matches m on m.tournament_id=t.id and m.match_number=v.n
join teams tm on tm.tournament_id=t.id and lower(tm.name)=lower(v.team);
commit;