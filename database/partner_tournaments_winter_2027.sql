-- Run after partner_tournaments.sql.
insert into public.partner_tournaments (id, name, closes_on, play_date)
values ('8296c11a-14e7-4c8e-b27d-f0a3bd4023e3', 'Makkerliga 2027 Vinter', '2026-12-04', '2027-02-13')
on conflict (id) do update
set name = excluded.name, closes_on = excluded.closes_on, play_date = excluded.play_date;
