-- Run once in Supabase SQL Editor, inside one transaction.
-- Keeps all messages. Replaces existing policies on these two tables so an
-- older permissive policy cannot override participant-only access.
begin;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null
);
create unique index if not exists push_subscriptions_endpoint_unique on public.push_subscriptions(endpoint);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
alter table public.beskeder enable row level security;

do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('beskeder', 'push_subscriptions')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
create policy push_own_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_own_insert on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_own_update on public.push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_own_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.beskeder from anon;
grant select, insert, update, delete on public.beskeder to authenticated;
create policy messages_participants_select on public.beskeder for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));
create policy messages_sender_insert on public.beskeder for insert to authenticated
  with check (sender_id = (select auth.uid()) and recipient_id <> sender_id and read_at is null
    and length(btrim(body)) between 1 and 5000
    and exists (select 1 from public.profiles p where p.id = sender_id and p.visningsnavn = sender_visningsnavn)
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.visningsnavn = recipient_visningsnavn));
create policy messages_recipient_update on public.beskeder for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy messages_sender_delete on public.beskeder for delete to authenticated using (sender_id = (select auth.uid()));

-- RLS alone would let a recipient edit the body. Only a read receipt may change.
create or replace function public.guard_message_read_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if auth.role() = 'service_role' or current_user in ('postgres', 'supabase_admin') then return new; end if;
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'Kun læst-status må ændres.' using errcode = '42501';
  end if;
  if old.read_at is not null then new.read_at := old.read_at;
  elsif new.read_at is not null then new.read_at := now();
  end if;
  return new;
end $$;
drop trigger if exists guard_message_read_receipt on public.beskeder;
create trigger guard_message_read_receipt before update on public.beskeder
  for each row execute function public.guard_message_read_receipt();

create index if not exists messages_recipient_created_idx on public.beskeder(recipient_id, created_at desc);
create index if not exists messages_sender_created_idx on public.beskeder(sender_id, created_at desc);

-- Polling remains a fallback if Realtime is not enabled in the project.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'beskeder')
  then alter publication supabase_realtime add table public.beskeder;
  end if;
end $$;
commit;
