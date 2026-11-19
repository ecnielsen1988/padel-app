-- Run after partner_league.sql. Safe to run again.
begin;

create or replace function public.cancel_partner_league_registration(p_actor uuid, p_id uuid, p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare entry public.partner_registrations%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_actor and rolle = 'admin') then
    raise exception using errcode = '42501', message = 'Kun admin kan fjerne tilmeldte par.';
  end if;
  -- Same lock order as pool publication: a pair cannot be removed while pools are being formed.
  perform 1 from public.partner_tournaments where id = p_tournament for update;
  select * into entry from public.partner_registrations
    where id = p_id and tournament_id = p_tournament for update;
  if not found then
    raise exception using errcode = '22023', message = 'Tilmeldingen blev ikke fundet.';
  end if;
  if exists (select 1 from public.partner_league_pool_teams where registration_id = entry.id) then
    raise exception using errcode = '22023', message = 'Parret er allerede placeret i en pulje og kan ikke fjernes her.';
  end if;
  update public.partner_registrations set status = 'cancelled' where id = entry.id;
  delete from public.partner_tournament_players where registration_id = entry.id;
end;
$$;

revoke all on function public.cancel_partner_league_registration(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_partner_league_registration(uuid, uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
