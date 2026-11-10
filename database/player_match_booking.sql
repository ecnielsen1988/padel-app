-- Run after player_matches.sql. Existing arrangements remain readable.
begin;

alter table public.player_matches add column if not exists confirmed_at timestamptz;

do $$
begin
  if to_regprocedure('public.player_match_action_base(uuid,text,uuid,jsonb)') is null then
    alter function public.player_match_action(uuid, text, uuid, jsonb) rename to player_match_action_base;
  end if;
end;
$$;

create or replace function public.player_match_action(p_actor uuid, p_action text, p_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.player_matches%rowtype;
  result jsonb;
  note text := 'Kampen er bekræftet: Banen er booket, og alle fire har sagt ja.';
begin
  if p_action in ('create', 'update') then
    if not coalesce(
      ((p_input->>'location' = 'Helsinge' and p_input->>'court' in ('Center Court', '1', '2', '3'))
       or (p_input->>'location' = 'Gilleleje' and p_input->>'court' in ('1', '2', '3', '5', '6')))
      and (p_input->>'time') ~ '^([01][0-9]|2[0-3]):00$', false) then
      raise exception using errcode = '22023', message = 'Vælg et gyldigt sted, en bane og et helt klokkeslæt.';
    end if;
  end if;

  if p_action in ('update', 'confirm') then
    select * into m from public.player_matches where id = p_id and players @> array[p_actor] for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Kampen blev ikke fundet.';
    end if;
  end if;

  if p_action = 'confirm' then
    if m.result_kampid is not null then
      raise exception using errcode = '40001', message = 'Resultatet er allerede indberettet.';
    end if;
    if m.revision is distinct from (p_input->>'revision')::integer then
      raise exception using errcode = '40001', message = 'Aftalen er ændret. Hent den nye aftale før bekræftelse.';
    end if;
    if m.confirmed_at is not null then
      return jsonb_build_object('id', m.id);
    end if;
    update public.player_matches set confirmed_at = now() where id = m.id;
    insert into public.player_match_messages(match_id, sender_id, body) values(m.id, p_actor, note);
    return jsonb_build_object('id', m.id, 'players', m.players, 'note', note);
  end if;

  result := public.player_match_action_base(p_actor, p_action, p_id, p_input);
  if p_action = 'update' and result ? 'note' then
    update public.player_matches set confirmed_at = null where id = p_id;
    if m.confirmed_at is not null then
      note := (result->>'note') || ' Kampen skal bekræftes igen.';
      result := result || jsonb_build_object('note', note);
    end if;
  end if;
  return result;
end;
$$;

revoke all on function public.player_match_action_base(uuid, text, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.player_match_action(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.player_match_action(uuid, text, uuid, jsonb) to service_role;
commit;
