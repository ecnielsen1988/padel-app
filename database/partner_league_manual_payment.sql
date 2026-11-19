-- Run after partner_league.sql. Safe to run again.
begin;
alter table public.partner_registrations add column if not exists contact_phone text
  check (contact_phone is null or contact_phone ~ '^\+?[0-9]{8,15}$');
update public.partner_tournaments set play_date = '2027-02-27'
  where id = '8296c11a-14e7-4c8e-b27d-f0a3bd4023e3';

create or replace function public.register_manual_partner_team(
  p_tournament uuid, p_payer uuid, p_partner uuid, p_division text, p_phone text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare entry_id uuid;
begin
  if p_phone is null or p_phone !~ '^\+?[0-9]{8,15}$' then
    raise exception using errcode = '22023', message = 'Indtast et gyldigt telefonnummer med 8–15 cifre.';
  end if;
  entry_id := public.reserve_partner_registration(p_tournament, p_payer, p_partner, p_division, 'manual:102438');
  update public.partner_registrations set contact_phone = p_phone where id = entry_id;
  return entry_id;
end;
$$;

create or replace function public.confirm_manual_partner_payment(p_actor uuid, p_id uuid, p_tournament uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare entry public.partner_registrations%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_actor and rolle = 'admin') then
    raise exception using errcode = '42501', message = 'Kun admin kan bekræfte betaling.';
  end if;
  select * into entry from public.partner_registrations
    where id = p_id and tournament_id = p_tournament and merchant = 'manual:102438' for update;
  if not found or entry.status = 'cancelled' then
    raise exception using errcode = '22023', message = 'Den manuelle tilmelding blev ikke fundet.';
  end if;
  return public.finish_partner_registration(entry.id, entry.merchant, 'paid');
end;
$$;

create or replace function public.partner_league_roster(p_actor uuid, p_tournament uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and rolle = 'admin') then
    raise exception using errcode = '42501', message = 'Kun admin har adgang.';
  end if;
  return jsonb_build_object(
    'closes_on', (select closes_on from public.partner_tournaments where id = p_tournament),
    'pools_published', exists (select 1 from public.partner_league_pools where tournament_id = p_tournament),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'division', r.division, 'status', r.status, 'created_at', r.created_at,
        'contact_phone', r.contact_phone, 'names', array[a.visningsnavn, b.visningsnavn]
      ) order by r.created_at, r.id)
      from public.partner_registrations r
      join public.profiles a on a.id = r.payer_id
      join public.profiles b on b.id = r.partner_id
      where r.tournament_id = p_tournament
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.partner_league_pools_for(p_actor uuid, p_tournament uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pool.id, 'division', pool.division, 'number', pool.number,
    'teams', (
      select jsonb_agg(jsonb_build_object('id', r.id, 'names', array[a.visningsnavn, b.visningsnavn],
        'contact_phone', case when exists (
          select 1 from public.partner_league_pool_teams own_team
          join public.partner_registrations own_registration on own_registration.id = own_team.registration_id
          where own_team.pool_id = pool.id and p_actor in (own_registration.payer_id, own_registration.partner_id)
        ) then r.contact_phone end) order by team.seed_points desc, r.id)
      from public.partner_league_pool_teams team
      join public.partner_registrations r on r.id = team.registration_id
      join public.profiles a on a.id = r.payer_id
      join public.profiles b on b.id = r.partner_id
      where team.pool_id = pool.id
    ),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', case when p_actor = any(m.players) then m.id end,
        'team_a', m.league_team_a, 'team_b', m.league_team_b, 'date', m.date, 'start_time', m.start_time,
        'location', m.location, 'court', m.court, 'confirmed', m.confirmed_at is not null,
        'sets', case when m.result_kampid is not null then m.result_sets end
      ) order by m.date nulls last, m.start_time, m.id)
      from public.player_matches m where m.league_pool_id = pool.id
    ), '[]'::jsonb)
  ) order by pool.division, pool.number), '[]'::jsonb)
  from public.partner_league_pools pool
  where pool.tournament_id = p_tournament and p_actor is not null;
$$;


revoke all on function public.register_manual_partner_team(uuid, uuid, uuid, text, text),
  public.confirm_manual_partner_payment(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.register_manual_partner_team(uuid, uuid, uuid, text, text),
  public.confirm_manual_partner_payment(uuid, uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
