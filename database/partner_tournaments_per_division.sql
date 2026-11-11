-- Run after partner_tournaments.sql.
begin;

alter table public.partner_tournament_players add column division text;

update public.partner_tournament_players as player
set division = registration.division
from public.partner_registrations as registration
where player.tournament_id = registration.tournament_id
  and player.registration_id = registration.id;

alter table public.partner_registrations
  add unique (tournament_id, id, division);

alter table public.partner_tournament_players
  alter column division set not null,
  drop constraint partner_tournament_players_pkey,
  add primary key (tournament_id, division, player_id),
  add foreign key (tournament_id, registration_id, division)
    references public.partner_registrations(tournament_id, id, division);

create or replace function public.reserve_partner_registration(
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

  insert into public.partner_tournament_players(tournament_id, player_id, registration_id, division)
    select p_tournament, player_id, entry_id, p_division
    from unnest(array[p_payer, p_partner]) as player(player_id)
    order by player_id;

  return entry_id;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'En af jer har allerede en tilmelding i denne række.';
end;
$$;

commit;
