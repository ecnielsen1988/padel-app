-- Run in Supabase SQL Editor before releasing the player match pages.
begin;

create table if not exists public.player_matches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  players uuid[] not null check (cardinality(players) = 4),
  date date not null,
  start_time time not null,
  location text not null,
  court text not null,
  created_at timestamptz not null default now(),
  revision integer not null default 1,
  result_kampid bigint unique,
  result_sets jsonb
);

create table if not exists public.player_match_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.player_matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.player_match_reads (
  match_id uuid not null references public.player_matches(id) on delete cascade,
  player_id uuid not null references public.profiles(id),
  read_at timestamptz not null,
  primary key (match_id, player_id)
);

create index if not exists player_matches_players_idx on public.player_matches using gin (players);
create index if not exists player_match_messages_timeline_idx on public.player_match_messages(match_id, created_at, id);

alter table public.player_matches enable row level security;
alter table public.player_match_messages enable row level security;
alter table public.player_match_reads enable row level security;
revoke all on public.player_matches, public.player_match_messages, public.player_match_reads from public, anon, authenticated;

-- Only the server calls these functions, after checking the actual Supabase session.
create or replace function public.player_matches_for(p_actor uuid, p_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    to_jsonb(m) - 'players' || jsonb_build_object(
      'players', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.visningsnavn, 'Spiller')) order by t.pos)
        from unnest(m.players) with ordinality as t(id, pos)
        join public.profiles p on p.id = t.id
      ), '[]'::jsonb),
      'last_message', (
        select jsonb_build_object('id', x.id, 'body', x.body, 'sender_id', x.sender_id, 'created_at', x.created_at)
        from public.player_match_messages x where x.match_id = m.id
        order by x.created_at desc, x.id desc limit 1
      ),
      'unread', (
        select count(*) from public.player_match_messages x where x.match_id = m.id and x.sender_id <> p_actor
          and x.created_at > coalesce(r.read_at, '-infinity'::timestamptz)
      ),
      'messages', case when p_id is not null then coalesce((
        select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
        from public.player_match_messages x where x.match_id = m.id
      ), '[]'::jsonb) else null end
    ) order by m.date desc, m.start_time desc, m.id
  ), '[]'::jsonb)
  from public.player_matches m
  left join public.player_match_reads r on r.match_id = m.id and r.player_id = p_actor
  where m.players @> array[p_actor] and (p_id is null or m.id = p_id)
$$;

create or replace function public.player_match_action(p_actor uuid, p_action text, p_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.player_matches%rowtype;
  ids uuid[];
  names text[];
  note text;
  match_date date;
  match_time time;
  match_location text;
  match_court text;
  result_id public.newresults.kampid%type;
  set_row jsonb;
  partner integer;
  opponents integer[];
  a integer;
  b integer;
begin
  if p_actor is null or not exists (select 1 from public.profiles where id = p_actor and btrim(visningsnavn) <> '') then
    raise exception using errcode = '42501', message = 'Du skal have en spillerprofil.';
  end if;

  if p_action in ('create', 'update') then
    match_date := (p_input->>'date')::date;
    match_time := (p_input->>'time')::time;
    match_location := btrim(p_input->>'location');
    match_court := btrim(p_input->>'court');
    if match_date is null or match_time is null
      or coalesce(length(match_location), 0) not between 1 and 100
      or coalesce(length(match_court), 0) not between 1 and 50 then
      raise exception using errcode = '22023', message = 'Vælg dato, tidspunkt, sted og bane.';
    end if;
  end if;

  if p_action = 'create' then
    select array_agg(value::uuid order by pos) into ids
      from jsonb_array_elements_text(p_input->'players') with ordinality as t(value, pos);
    if coalesce(cardinality(ids), 0) <> 4 or not (p_actor = any(ids))
      or (select count(distinct id) from unnest(ids) as t(id)) <> 4
      or (select count(*) from public.profiles where id = any(ids) and btrim(visningsnavn) <> '' and status in ('active','sleep')) <> 4 then
      raise exception using errcode = '22023', message = 'Vælg fire forskellige spillere, inklusive dig selv.';
    end if;
    insert into public.player_matches (created_by, players, date, start_time, location, court)
      values (p_actor, ids, match_date, match_time, match_location, match_court) returning * into m;
    note := 'Kampen er oprettet: ';
  else
    select * into m from public.player_matches where id = p_id and players @> array[p_actor] for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Kampen blev ikke fundet.';
    end if;

    case p_action
      when 'read' then
        insert into public.player_match_reads(match_id, player_id, read_at)
          values(m.id, p_actor, least((p_input->>'through')::timestamptz, now()))
          on conflict (match_id, player_id) do update
          set read_at = greatest(public.player_match_reads.read_at, excluded.read_at);
        return jsonb_build_object('id', m.id);
      when 'message' then
        note := regexp_replace(p_input->>'body', '^[[:space:]]+|[[:space:]]+$', '', 'g');
        if coalesce(length(note), 0) not between 1 and 5000 then
          raise exception using errcode = '22023', message = 'Skriv en besked på højst 5.000 tegn.';
        end if;
      when 'update' then
        if m.result_kampid is not null then
          raise exception using errcode = '40001', message = 'Aftalen kan ikke ændres efter resultatet er indberettet.';
        end if;
        if m.revision is distinct from (p_input->>'revision')::integer then
          raise exception using errcode = '40001', message = 'Aftalen er ændret af en anden spiller. Hent den nye aftale og prøv igen.';
        end if;
        if (m.date, m.start_time, m.location, m.court) = (match_date, match_time, match_location, match_court) then
          return jsonb_build_object('id', m.id);
        end if;
        update public.player_matches set date = match_date, start_time = match_time,
          location = match_location, court = match_court, revision = revision + 1
          where id = m.id returning * into m;
        note := 'Kampaftalen er ændret: ';
      when 'result' then
        if m.result_kampid is not null then
          return jsonb_build_object('id', m.id, 'result_kampid', m.result_kampid);
        end if;
        if m.revision is distinct from (p_input->>'revision')::integer then
          raise exception using errcode = '40001', message = 'Aftalen er ændret. Hent den nye aftale før indberetning.';
        end if;
        if m.date + m.start_time > (now() at time zone 'Europe/Copenhagen') then
          raise exception using errcode = '22023', message = 'Kampen kan først indberettes efter det aftalte starttidspunkt.';
        end if;
        if jsonb_typeof(p_input->'sets') is distinct from 'array'
          or jsonb_array_length(p_input->'sets') not between 1 and 12 then
          raise exception using errcode = '22023', message = 'Indtast mellem 1 og 12 sæt.';
        end if;
        select array_agg(nullif(btrim(p.visningsnavn), '') order by t.pos) into names
          from unnest(m.players) with ordinality as t(id, pos)
          left join public.profiles p on p.id = t.id;
        if (select count(distinct name) from unnest(names) as t(name)) <> 4 then
          raise exception using errcode = '22023', message = 'De fire spillere skal have forskellige visningsnavne.';
        end if;

        -- Keep the existing ranking format and publish all sets as one transaction.
        lock table public.newresults in share row exclusive mode;
        select coalesce(max(kampid), 0) + 1 into result_id from public.newresults;
        for set_row in select value from jsonb_array_elements(p_input->'sets') loop
          a := (set_row->>'a')::integer;
          b := (set_row->>'b')::integer;
          partner := (set_row->>'partner')::integer;
          if a is null or b is null or partner is null or a not between 0 and 7 or b not between 0 and 7
            or (a = 0 and b = 0) or partner not between 2 and 4 then
            raise exception using errcode = '22023', message = 'Alle sæt skal have en gyldig score og et makkerpar.';
          end if;
          opponents := array(select i from generate_series(2, 4) i where i <> partner);
          insert into public.newresults
            (date, "holdA1", "holdA2", "holdB1", "holdB2", "scoreA", "scoreB", finish, event, tiebreak, kampid, indberettet_af)
          values (m.date, names[1], names[partner], names[opponents[1]], names[opponents[2]], a, b,
            (greatest(a,b) = 6 and least(a,b) <= 4) or (greatest(a,b) = 7 and least(a,b) in (5,6)),
            false, 'ingen', result_id, (select btrim(visningsnavn) from public.profiles where id = p_actor));
        end loop;
        update public.player_matches set result_kampid = result_id, result_sets = p_input->'sets'
          where id = m.id returning * into m;
        update public.profiles set status = 'active' where id = any(m.players) and status = 'sleep';
        note := 'Resultatet er indberettet til ranglisten.';
      else
        raise exception using errcode = '22023', message = 'Ukendt handling.';
    end case;
  end if;

  if p_action in ('create', 'update') then
    note := note || to_char(m.date, 'DD.MM.YYYY') || ' kl. ' || to_char(m.start_time, 'HH24:MI')
      || ' · ' || m.location || ' · Bane ' || m.court || '.';
  end if;
  insert into public.player_match_messages (match_id, sender_id, body) values (m.id, p_actor, note);
  return jsonb_build_object('id', m.id, 'players', m.players, 'note', note, 'result_kampid', m.result_kampid);
end;
$$;

revoke all on function public.player_matches_for(uuid, uuid) from public, anon, authenticated;
revoke all on function public.player_match_action(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.player_matches_for(uuid, uuid) to service_role;
grant execute on function public.player_match_action(uuid, text, uuid, jsonb) to service_role;
commit;
