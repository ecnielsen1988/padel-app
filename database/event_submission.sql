begin;

create or replace function public.save_event_submission(
  p_actor uuid,
  p_event_id text,
  p_rules_text text,
  p_date text,
  p_visible_rules text,
  p_meta jsonb,
  p_from bigint,
  p_to bigint,
  p_rows jsonb,
  p_activate_players boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id public.events.id%type := p_event_id;
  current_event public.events%rowtype;
  reporter text;
  first_id public.newresults.kampid%type;
  last_id public.newresults.kampid%type;
  submitted_count integer;
  next_meta jsonb := p_meta - 'submissionRange';
begin
  select btrim(visningsnavn) into reporter
  from public.profiles
  where id = p_actor and rolle = 'admin';
  if reporter is null or reporter = '' then
    raise exception using errcode = '42501', message = 'Kun en admin med et visningsnavn kan indberette events.';
  end if;

  select * into current_event from public.events where id = target_id for update;
  if not found or current_event.rules_text is distinct from p_rules_text
    or current_event.date::text is distinct from p_date then
    raise exception using errcode = '40001', message = 'Eventet er blevet ændret. Genindlæs siden og prøv igen.';
  end if;

  if p_rows is null then
    delete from public.newresults
    where event is true and date = current_event.date and kampid between p_from and p_to;
    submitted_count := 0;
  else
    select count(*) into submitted_count from public.newresults
    where event is true and date = current_event.date and kampid between p_from and p_to;
    if submitted_count > 0 then
      return jsonb_build_object('event', to_jsonb(current_event), 'count', submitted_count, 'alreadySubmitted', true);
    end if;

    -- Share match-ID allocation with the player match submission function.
    lock table public.newresults in share row exclusive mode;
    select greatest(coalesce(max(kampid), 0), 0) + 1 into first_id from public.newresults;

    insert into public.newresults
      (date, "holdA1", "holdA2", "holdB1", "holdB2", "scoreA", "scoreB", finish, event, tiebreak, kampid, indberettet_af)
    select current_event.date, "holdA1", "holdA2", "holdB1", "holdB2", "scoreA", "scoreB",
      finish, true, tiebreak, first_id + dense_rank() over (order by match_index) - 1, reporter
    from jsonb_to_recordset(p_rows) as sets(
      match_index integer, "holdA1" text, "holdA2" text, "holdB1" text, "holdB2" text,
      "scoreA" integer, "scoreB" integer, finish boolean, tiebreak text
    );
    get diagnostics submitted_count = row_count;
    select first_id + count(distinct (set_row->>'match_index')::integer) - 1 into last_id
    from jsonb_array_elements(p_rows) as set_row;
    next_meta := next_meta || jsonb_build_object(
      'submissionRange', jsonb_build_object('from', first_id, 'to', last_id)
    );

    if p_activate_players then
      update public.profiles set status = 'active'
      where status = 'sleep' and visningsnavn in (
        select unnest(array[set_row->>'holdA1', set_row->>'holdA2', set_row->>'holdB1', set_row->>'holdB2'])
        from jsonb_array_elements(p_rows) as set_row
      );
    end if;
  end if;

  update public.events
  set rules_text = case when next_meta = '{}'::jsonb then nullif(p_visible_rules, '')
    else p_visible_rules || E'\n<!--PADEL_EVENT_META:' || next_meta::text || '-->' end
  where id = target_id
  returning * into current_event;

  return jsonb_build_object('event', to_jsonb(current_event), 'count', submitted_count, 'alreadySubmitted', false);
end;
$$;

revoke all on function public.save_event_submission(uuid, text, text, text, text, jsonb, bigint, bigint, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.save_event_submission(uuid, text, text, text, text, jsonb, bigint, bigint, jsonb, boolean)
  to service_role;

commit;
