-- Run after player_matches.sql and player_match_booking.sql. Safe to rerun to update deletion permissions.
begin;

create or replace function public.delete_player_match(p_actor uuid, p_id uuid, p_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.player_matches%rowtype;
begin
  select * into m from public.player_matches
    where id = p_id and players @> array[p_actor]
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Kampen blev ikke fundet.';
  end if;
  if m.result_kampid is not null then
    raise exception using errcode = '40001', message = 'En kamp med indberettet resultat kan ikke slettes.';
  end if;
  if m.revision is distinct from p_revision then
    raise exception using errcode = '40001', message = 'Aftalen er ændret. Hent den nye aftale før sletning.';
  end if;

  -- The match row lock serializes this with result reporting. Chat and read marks cascade.
  delete from public.player_matches where id = m.id;
  return jsonb_build_object('id', m.id, 'players', m.players,
    'note', 'Kampen den ' || to_char(m.date, 'DD.MM.YYYY') || ' kl. ' ||
      to_char(m.start_time, 'HH24:MI') || ' i ' || m.location || ' er blevet slettet.');
end;
$$;

revoke all on function public.delete_player_match(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.delete_player_match(uuid, uuid, integer) to service_role;
commit;
