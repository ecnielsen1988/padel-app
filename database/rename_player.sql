-- Run once in the Supabase SQL editor before using Admin → Spillernavne.
-- All changes run in one transaction; errors roll back the entire rename.
create or replace function public.admin_rename_player(
  p_profile_id uuid,
  p_expected_name text,
  p_new_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_name text;
  new_name text := btrim(p_new_name);
  result_count integer;
  elo_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and rolle = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Kun admin har adgang.';
  end if;

  if new_name is null or length(new_name) = 0 or length(new_name) > 100 then
    raise exception using errcode = '22023', message = 'Navnet skal være mellem 1 og 100 tegn.';
  end if;

  -- Serialize renames and block writes while checking for ambiguous names.
  lock table public.profiles, public.newresults, public.elo_day_state in share row exclusive mode;

  select visningsnavn into old_name from public.profiles where id = p_profile_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Spilleren blev ikke fundet.';
  end if;
  if old_name is distinct from p_expected_name then
    raise exception using errcode = '40001', message = 'Spillerens navn er ændret. Genindlæs siden og prøv igen.';
  end if;
  if old_name is null or btrim(old_name) = '' then
    raise exception using errcode = '22023', message = 'Spilleren mangler et eksisterende navn, som historikken kan findes ud fra.';
  end if;
  if old_name = new_name then
    raise exception using errcode = '22023', message = 'Skriv et nyt navn.';
  end if;
  if exists (
    select 1 from public.profiles
    where id <> p_profile_id and lower(btrim(visningsnavn)) = lower(btrim(old_name))
  ) then
    raise exception using errcode = '23505', message = 'Flere profiler har det gamle navn. Historikken kan ikke knyttes entydigt til spilleren.';
  end if;
  if exists (
    select 1 from public.profiles
    where id <> p_profile_id and lower(btrim(visningsnavn)) = lower(new_name)
  ) or exists (
    select 1 from public.newresults r
    cross join lateral unnest(array[r."holdA1", r."holdA2", r."holdB1", r."holdB2", r.indberettet_af]) as names(name)
    where lower(btrim(name)) = lower(new_name) and btrim(name) <> btrim(old_name)
  ) or exists (
    select 1 from public.elo_day_state
    where lower(btrim(visningsnavn)) = lower(new_name) and btrim(visningsnavn) <> btrim(old_name)
  ) then
    raise exception using errcode = '23505', message = 'Det nye navn findes allerede i profiler eller historik. Vælg et andet navn.';
  end if;

  update public.newresults set
    "holdA1" = case when btrim("holdA1") = btrim(old_name) then new_name else "holdA1" end,
    "holdA2" = case when btrim("holdA2") = btrim(old_name) then new_name else "holdA2" end,
    "holdB1" = case when btrim("holdB1") = btrim(old_name) then new_name else "holdB1" end,
    "holdB2" = case when btrim("holdB2") = btrim(old_name) then new_name else "holdB2" end,
    indberettet_af = case when btrim(indberettet_af) = btrim(old_name) then new_name else indberettet_af end
  where btrim(old_name) in (btrim("holdA1"), btrim("holdA2"), btrim("holdB1"), btrim("holdB2"), btrim(indberettet_af));
  get diagnostics result_count = row_count;

  update public.elo_day_state set visningsnavn = new_name
  where btrim(visningsnavn) = btrim(old_name);
  get diagnostics elo_count = row_count;

  update public.profiles set visningsnavn = new_name where id = p_profile_id;

  return jsonb_build_object('name', new_name, 'resultsUpdated', result_count, 'eloDaysUpdated', elo_count);
end;
$$;

revoke all on function public.admin_rename_player(uuid, text, text) from public, anon;
grant execute on function public.admin_rename_player(uuid, text, text) to authenticated;
