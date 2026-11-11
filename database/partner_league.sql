-- Run after the partner tournament and player match migrations.
begin;

create table public.partner_league_pools (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.partner_tournaments(id),
  division text not null check (division in ('open', 'mix', 'women')),
  number integer not null check (number > 0),
  unique (tournament_id, division, number),
  unique (id, tournament_id, division)
);

create table public.partner_league_pool_teams (
  pool_id uuid not null,
  tournament_id uuid not null,
  division text not null,
  registration_id uuid not null unique,
  seed_points numeric not null,
  primary key (pool_id, registration_id),
  foreign key (pool_id, tournament_id, division) references public.partner_league_pools(id, tournament_id, division),
  foreign key (tournament_id, registration_id, division) references public.partner_registrations(tournament_id, id, division)
);

alter table public.player_matches
  alter column date drop not null,
  alter column start_time drop not null,
  alter column location drop not null,
  alter column court drop not null,
  add column league_pool_id uuid,
  add column league_team_a uuid,
  add column league_team_b uuid,
  add foreign key (league_pool_id, league_team_a) references public.partner_league_pool_teams(pool_id, registration_id),
  add foreign key (league_pool_id, league_team_b) references public.partner_league_pool_teams(pool_id, registration_id),
  add unique (league_pool_id, league_team_a, league_team_b),
  add check (
    (league_pool_id is null and league_team_a is null and league_team_b is null
      and date is not null and start_time is not null and location is not null and court is not null)
    or
    (league_pool_id is not null and league_team_a is not null and league_team_b is not null and league_team_a < league_team_b
      and ((date is null and start_time is null and location is null and court is null and confirmed_at is null)
        or (date is not null and start_time is not null and location is not null and court is not null)))
  );

alter table public.partner_league_pools enable row level security;
alter table public.partner_league_pool_teams enable row level security;
revoke all on public.partner_league_pools, public.partner_league_pool_teams from public, anon, authenticated;

create function public.partner_league_roster(p_actor uuid, p_tournament uuid)
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
        'names', array[a.visningsnavn, b.visningsnavn]
      ) order by r.created_at, r.id)
      from public.partner_registrations r
      join public.profiles a on a.id = r.payer_id
      join public.profiles b on b.id = r.partner_id
      where r.tournament_id = p_tournament
    ), '[]'::jsonb)
  );
end;
$$;

create function public.publish_partner_league_pools(p_actor uuid, p_tournament uuid, p_elo jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  deadline date;
begin
  if not exists (select 1 from public.profiles where id = p_actor and rolle = 'admin') then
    raise exception using errcode = '42501', message = 'Kun admin kan danne puljer.';
  end if;
  select closes_on into deadline from public.partner_tournaments where id = p_tournament for update;
  if not found then
    raise exception using errcode = '22023', message = 'Sæsonen er endnu ikke oprettet.';
  end if;
  if deadline >= timezone('Europe/Copenhagen', now())::date then
    raise exception using errcode = '22023', message = 'Puljerne dannes efter tilmeldingsfristen.';
  end if;
  if exists (select 1 from public.partner_league_pools where tournament_id = p_tournament) then
    return;
  end if;

  -- Lock the same registrations that the payment handler updates, then keep the snapshot in the pool teams.
  perform 1 from public.partner_registrations where tournament_id = p_tournament order by id for update;
  if not exists (select 1 from public.partner_registrations where tournament_id = p_tournament and status = 'paid') then
    raise exception using errcode = '22023', message = 'Der er ingen betalte tilmeldinger.';
  end if;
  if exists (
    select 1 from public.partner_registrations r
    join public.profiles a on a.id = r.payer_id
    join public.profiles b on b.id = r.partner_id
    where r.tournament_id = p_tournament and r.status = 'paid'
      and (jsonb_typeof(p_elo->btrim(a.visningsnavn)) is distinct from 'number'
        or jsonb_typeof(p_elo->btrim(b.visningsnavn)) is distinct from 'number')
  ) then
    raise exception using errcode = '22023', message = 'Der mangler ranglistepoint for mindst én tilmeldt spiller.';
  end if;

  with seeded as (
    select r.id, r.division,
      (p_elo->>btrim(a.visningsnavn))::numeric + (p_elo->>btrim(b.visningsnavn))::numeric as points
    from public.partner_registrations r
    join public.profiles a on a.id = r.payer_id
    join public.profiles b on b.id = r.partner_id
    where r.tournament_id = p_tournament and r.status = 'paid'
  ), sized as (
    select *, greatest(1, round(count(*) over (partition by division) / 6.0)::integer) as pool_count
    from seeded
  ), assigned as (
    select *, ntile(pool_count) over (partition by division order by points desc, id) as pool_number
    from sized
  ), pools as (
    insert into public.partner_league_pools(tournament_id, division, number)
      select distinct p_tournament, division, pool_number from assigned
      returning id, division, number
  )
  insert into public.partner_league_pool_teams(pool_id, tournament_id, division, registration_id, seed_points)
    select pools.id, p_tournament, assigned.division, assigned.id, assigned.points
    from assigned join pools on pools.division = assigned.division and pools.number = assigned.pool_number;

  insert into public.player_matches(created_by, players, league_pool_id, league_team_a, league_team_b)
    select p_actor, array[a.payer_id, a.partner_id, b.payer_id, b.partner_id], first.pool_id, a.id, b.id
    from public.partner_league_pool_teams first
    join public.partner_league_pool_teams second on second.pool_id = first.pool_id and first.registration_id < second.registration_id
    join public.partner_registrations a on a.id = first.registration_id
    join public.partner_registrations b on b.id = second.registration_id
    where first.tournament_id = p_tournament;
end;
$$;

create function public.partner_league_pools_for(p_actor uuid, p_tournament uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pool.id, 'division', pool.division, 'number', pool.number,
    'teams', (
      select jsonb_agg(jsonb_build_object('id', r.id, 'names', array[a.visningsnavn, b.visningsnavn]) order by team.seed_points desc, r.id)
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

create function public.confirmed_partner_league_matches(p_tournament uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', m.date, 'start_time', m.start_time, 'location', m.location, 'court', m.court,
    'division', pool.division, 'pool', pool.number
  ) order by m.date, m.start_time, m.location, m.court, m.id), '[]'::jsonb)
  from public.player_matches m
  join public.partner_league_pools pool on pool.id = m.league_pool_id
  where pool.tournament_id = p_tournament and m.confirmed_at is not null;
$$;

alter function public.player_match_action(uuid, text, uuid, jsonb) rename to player_match_action_before_league;

create function public.player_match_action(p_actor uuid, p_action text, p_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.player_matches%rowtype;
  result jsonb;
  set_row jsonb;
  score_a integer;
  score_b integer;
  won_a integer := 0;
  won_b integer := 0;
begin
  if p_action in ('update', 'confirm', 'result') then
    select * into m from public.player_matches where id = p_id and players @> array[p_actor] for update;
  end if;
  if m.league_pool_id is not null then
    if p_action in ('confirm', 'result') and m.date is null then
      raise exception using errcode = '22023', message = 'Aftal et tidspunkt først.';
    end if;
    if p_action = 'result' and m.result_kampid is null then
      if m.confirmed_at is null then
        raise exception using errcode = '22023', message = 'Bekræft bookingen før resultatet indberettes.';
      end if;
      if jsonb_typeof(p_input->'sets') is distinct from 'array' then
        raise exception using errcode = '22023', message = 'Indtast kampens sæt.';
      end if;
      if jsonb_array_length(p_input->'sets') not between 2 and 3 then
        raise exception using errcode = '22023', message = 'Makkerliga spilles bedst af tre fulde sæt.';
      end if;
      for set_row in select value from jsonb_array_elements(p_input->'sets') loop
        score_a := (set_row->>'a')::integer;
        score_b := (set_row->>'b')::integer;
        if won_a = 2 or won_b = 2 or (set_row->>'partner')::integer is distinct from 2
          or not coalesce(
            (greatest(score_a, score_b) = 6 and least(score_a, score_b) between 0 and 4)
            or (greatest(score_a, score_b) = 7 and least(score_a, score_b) in (5, 6)), false
          ) or score_a is null or score_b is null then
          raise exception using errcode = '22023', message = 'Indtast kun fulde sæt med de faste makkerpar.';
        end if;
        won_a := won_a + (score_a > score_b)::integer;
        won_b := won_b + (score_b > score_a)::integer;
      end loop;
      if won_a <> 2 and won_b <> 2 then
        raise exception using errcode = '22023', message = 'Et par skal vinde to sæt.';
      end if;
      result := public.player_match_action_before_league(p_actor, p_action, p_id, p_input);
      update public.newresults set event = true where kampid = (result->>'result_kampid')::bigint;
      return result;
    end if;
  end if;
  return public.player_match_action_before_league(p_actor, p_action, p_id, p_input);
end;
$$;

create function public.keep_partner_league_fixture()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '40001', message = 'En Makkerliga-kamp bliver i puljen. I kan ændre aftalen.';
end;
$$;

create trigger keep_partner_league_fixture
before delete on public.player_matches
for each row when (old.league_pool_id is not null)
execute function public.keep_partner_league_fixture();

revoke all on function public.player_match_action_before_league(uuid, text, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.player_match_action(uuid, text, uuid, jsonb),
  public.partner_league_roster(uuid, uuid), public.publish_partner_league_pools(uuid, uuid, jsonb),
  public.partner_league_pools_for(uuid, uuid), public.confirmed_partner_league_matches(uuid)
  from public, anon, authenticated;
grant execute on function public.player_match_action(uuid, text, uuid, jsonb),
  public.partner_league_roster(uuid, uuid), public.publish_partner_league_pools(uuid, uuid, jsonb),
  public.partner_league_pools_for(uuid, uuid), public.confirmed_partner_league_matches(uuid)
  to service_role;

commit;
