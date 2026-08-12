alter table public.torsdag_fines
  drop constraint if exists torsdag_fines_status_check;

alter table public.torsdag_fines
  add constraint torsdag_fines_status_check
  check (status in ('open', 'pending', 'paid', 'cancelled'));

alter table public.torsdag_fines
  add column if not exists payment_requested_at timestamptz,
  add column if not exists settled_at timestamptz;
