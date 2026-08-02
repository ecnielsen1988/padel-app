create extension if not exists pgcrypto;

create table if not exists public.torsdag_fines (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.profiles(id) on delete set null,
  visningsnavn text not null,
  fine_type text not null,
  reason text not null,
  amount_ore integer not null check (amount_ore > 0),
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  event_date date,
  minutes_late integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists torsdag_fines_visningsnavn_idx on public.torsdag_fines (visningsnavn);
create index if not exists torsdag_fines_status_idx on public.torsdag_fines (status);
create index if not exists torsdag_fines_created_at_idx on public.torsdag_fines (created_at desc);

create table if not exists public.torsdag_drink_ledger (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.profiles(id) on delete set null,
  visningsnavn text not null,
  drink_type text not null check (drink_type in ('beer', 'soda')),
  direction text not null check (direction in ('earned', 'redeemed')),
  quantity integer not null check (quantity > 0),
  note text,
  event_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists torsdag_drink_ledger_visningsnavn_idx on public.torsdag_drink_ledger (visningsnavn);
create index if not exists torsdag_drink_ledger_created_at_idx on public.torsdag_drink_ledger (created_at desc);

alter table public.torsdag_fines enable row level security;
alter table public.torsdag_drink_ledger enable row level security;

comment on table public.torsdag_fines is 'Torsdagspadel bøder. Bruges til åbne/afsluttede bøder og senere betalinger.';
comment on table public.torsdag_drink_ledger is 'Torsdagspadel drikke-præmier. earned = vundet, redeemed = udleveret.';
