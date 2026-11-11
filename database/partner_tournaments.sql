begin;

create table public.partner_tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  play_date date not null,
  closes_on date not null check (closes_on <= play_date)
);

create table public.partner_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.partner_tournaments(id),
  payer_id uuid not null references public.profiles(id),
  partner_id uuid not null references public.profiles(id),
  division text not null check (division in ('open', 'mix', 'women')),
  merchant text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  check (payer_id <> partner_id),
  unique (tournament_id, id)
);

create index partner_registrations_payer_idx on public.partner_registrations(payer_id);
create index partner_registrations_partner_idx on public.partner_registrations(partner_id);

create table public.partner_tournament_players (
  tournament_id uuid not null,
  player_id uuid not null references public.profiles(id),
  registration_id uuid not null,
  primary key (tournament_id, player_id),
  foreign key (tournament_id, registration_id)
    references public.partner_registrations(tournament_id, id)
);

create index partner_tournament_players_registration_idx on public.partner_tournament_players(registration_id);

alter table public.partner_tournaments enable row level security;
alter table public.partner_registrations enable row level security;
alter table public.partner_tournament_players enable row level security;
revoke all on public.partner_tournaments, public.partner_registrations,
  public.partner_tournament_players from public, anon, authenticated;
grant select, insert on public.partner_tournaments to service_role;
grant select on public.partner_registrations to service_role;

create function public.reserve_partner_registration(
  p_tournament uuid, p_payer uuid, p_partner uuid, p_division text, p_merchant text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  entry_id uuid;
  payer_gender text;
  partner_gender text;
begin
  perform 1 from public.partner_tournaments
  where id = p_tournament and closes_on >= timezone('Europe/Copenhagen', now())::date
  for share;
  if not found then
    raise exception using errcode = '22023', message = 'Tilmeldingen til turneringen er lukket.';
  end if;

  if p_payer = p_partner or p_division not in ('open', 'mix', 'women') then
    raise exception using errcode = '22023', message = 'Vælg en række og en anden spiller som makker.';
  end if;

  select lower(trim(koen)) into payer_gender from public.profiles
  where id = p_payer and trim(visningsnavn) <> '';
  if not found then
    raise exception using errcode = '22023', message = 'Udfyld dit spillernavn på din profil.';
  end if;

  select lower(trim(koen)) into partner_gender from public.profiles
  where id = p_partner and trim(visningsnavn) <> '';
  if not found then
    raise exception using errcode = '22023', message = 'Vælg en makker med en spillerprofil.';
  end if;

  if p_division = 'women' and (payer_gender is distinct from 'kvinde' or partner_gender is distinct from 'kvinde') then
    raise exception using errcode = '22023', message = 'Kvinderækken kræver to kvinder.';
  end if;

  if p_division = 'mix' and not coalesce(
    (payer_gender = 'kvinde' and partner_gender = 'mand') or
    (payer_gender = 'mand' and partner_gender = 'kvinde'), false
  ) then
    raise exception using errcode = '22023', message = 'Mix kræver én kvinde og én mand.';
  end if;

  insert into public.partner_registrations(tournament_id, payer_id, partner_id, division, merchant)
    values (p_tournament, p_payer, p_partner, p_division, p_merchant)
    returning id into entry_id;

  insert into public.partner_tournament_players(tournament_id, player_id, registration_id)
    select p_tournament, player_id, entry_id
    from unnest(array[p_payer, p_partner]) as player(player_id)
    order by player_id;

  return entry_id;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'En af jer har allerede en tilmelding til turneringen.';
end;
$$;

create function public.finish_partner_registration(p_id uuid, p_merchant text, p_status text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  current_status text;
begin
  if p_status not in ('paid', 'cancelled') then
    raise exception using errcode = '22023', message = 'Ugyldig betalingsstatus.';
  end if;

  update public.partner_registrations
  set status = p_status, paid_at = case when p_status = 'paid' then now() end
  where id = p_id and merchant = p_merchant and status = 'pending'
  returning status into current_status;

  if current_status = 'cancelled' then
    delete from public.partner_tournament_players where registration_id = p_id;
  end if;

  if current_status is null then
    select status into current_status from public.partner_registrations
      where id = p_id and merchant = p_merchant;
  end if;
  return current_status;
end;
$$;

revoke all on function public.reserve_partner_registration(uuid, uuid, uuid, text, text),
  public.finish_partner_registration(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_partner_registration(uuid, uuid, uuid, text, text),
  public.finish_partner_registration(uuid, text, text) to service_role;

commit;
