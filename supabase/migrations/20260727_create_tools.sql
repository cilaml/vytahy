create extension if not exists pgcrypto;

create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  inventory_number text not null unique,
  name text not null,
  category text,
  brand text,
  model text,
  serial_number text,
  status text not null default 'sklad' check (status in ('sklad','vydano','oprava','vyrazeno')),
  current_holder_id uuid references public.profiles(id) on delete set null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_movements (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  movement_type text not null check (movement_type in ('vydani','vraceni','predani','oprava','vyrazeni')),
  from_profile_id uuid references public.profiles(id) on delete set null,
  to_profile_id uuid references public.profiles(id) on delete set null,
  planned_action_id uuid references public.planned_actions(id) on delete set null,
  note text,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.planned_action_tools (
  id uuid primary key default gen_random_uuid(),
  planned_action_id uuid not null references public.planned_actions(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete cascade,
  returned_at timestamptz,
  unique(planned_action_id, tool_id)
);

create index if not exists tools_holder_idx on public.tools(current_holder_id);
create index if not exists tools_status_idx on public.tools(status);
create index if not exists tool_movements_tool_idx on public.tool_movements(tool_id, created_at desc);

alter table public.tools enable row level security;
alter table public.tool_movements enable row level security;
alter table public.planned_action_tools enable row level security;

create policy "authenticated can read tools" on public.tools for select to authenticated using (true);
create policy "authenticated can manage tools" on public.tools for all to authenticated using (true) with check (true);
create policy "authenticated can read movements" on public.tool_movements for select to authenticated using (true);
create policy "authenticated can add movements" on public.tool_movements for insert to authenticated with check (true);
create policy "authenticated can manage action tools" on public.planned_action_tools for all to authenticated using (true) with check (true);
