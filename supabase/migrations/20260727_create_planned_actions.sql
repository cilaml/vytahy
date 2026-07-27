create extension if not exists pgcrypto;

create table if not exists public.planned_actions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  action_type text not null check (action_type in ('servis','porucha','montaz','oprava','op','oz','ip','jine')),
  status text not null default 'planovano' check (status in ('planovano','potvrzeno','na_ceste','rozpracovano','hotovo','zruseno')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  address text not null default '',
  contact_name text,
  contact_phone text,
  description text,
  elevator_id uuid references public.elevators(id) on delete set null,
  region_id uuid references public.regions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  google_event_id text,
  google_sync_status text not null default 'pending' check (google_sync_status in ('pending','synced','error','disabled')),
  google_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_actions_valid_time check (ends_at >= starts_at)
);

create table if not exists public.planned_action_assignees (
  id uuid primary key default gen_random_uuid(),
  planned_action_id uuid not null references public.planned_actions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  is_lead boolean not null default false,
  created_at timestamptz not null default now(),
  unique (planned_action_id, profile_id)
);

create index if not exists planned_actions_starts_at_idx on public.planned_actions(starts_at);
create index if not exists planned_actions_status_idx on public.planned_actions(status);
create index if not exists planned_action_assignees_profile_idx on public.planned_action_assignees(profile_id);

alter table public.planned_actions enable row level security;
alter table public.planned_action_assignees enable row level security;

drop policy if exists "authenticated can read planned actions" on public.planned_actions;
create policy "authenticated can read planned actions"
on public.planned_actions for select
to authenticated
using (true);

drop policy if exists "authenticated can create planned actions" on public.planned_actions;
create policy "authenticated can create planned actions"
on public.planned_actions for insert
to authenticated
with check (auth.uid() = created_by);

drop policy if exists "managers can update planned actions" on public.planned_actions;
create policy "managers can update planned actions"
on public.planned_actions for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','vedouci_technik','sekretariat','servis')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','vedouci_technik','sekretariat','servis')
  )
);

drop policy if exists "managers can delete planned actions" on public.planned_actions;
create policy "managers can delete planned actions"
on public.planned_actions for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','vedouci_technik','sekretariat','servis')
  )
);

drop policy if exists "authenticated can read planned assignees" on public.planned_action_assignees;
create policy "authenticated can read planned assignees"
on public.planned_action_assignees for select
to authenticated
using (true);

drop policy if exists "managers can manage planned assignees" on public.planned_action_assignees;
create policy "managers can manage planned assignees"
on public.planned_action_assignees for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','vedouci_technik','sekretariat','servis')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','vedouci_technik','sekretariat','servis')
  )
);

create or replace function public.set_planned_action_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists planned_actions_set_updated_at on public.planned_actions;
create trigger planned_actions_set_updated_at
before update on public.planned_actions
for each row execute function public.set_planned_action_updated_at();
