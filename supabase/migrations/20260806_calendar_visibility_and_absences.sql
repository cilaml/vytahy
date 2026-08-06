create extension if not exists pgcrypto;

-- Každý zaměstnanec má vlastní barvu používanou v plánovači.
alter table public.profiles
  add column if not exists calendar_color text not null default '#3478F6';

alter table public.profiles
  drop constraint if exists profiles_calendar_color_check;

alter table public.profiles
  add constraint profiles_calendar_color_check
  check (calendar_color ~ '^#[0-9A-Fa-f]{6}$');

-- Stávajícím zaměstnancům přiřadíme rozlišitelné výchozí barvy.
with numbered_profiles as (
  select
    id,
    row_number() over (order by full_name, id) as position
  from public.profiles
  where calendar_color = '#3478F6'
)
update public.profiles as profile
set calendar_color = palette.colors[((numbered_profiles.position - 1) % array_length(palette.colors, 1)) + 1]
from numbered_profiles,
     (select array[
       '#3478F6', '#079447', '#E98A25', '#8156E8',
       '#E34A4A', '#00A1A7', '#B36B00', '#D04B91',
       '#526D82', '#6B8E23', '#8B5E3C', '#3A86A8'
     ]::text[] as colors) as palette
where profile.id = numbered_profiles.id;

-- Viditelnost plánovaných akcí: všichni, nebo jen vybraní lidé.
alter table public.planned_actions
  add column if not exists visibility text not null default 'all';

alter table public.planned_actions
  drop constraint if exists planned_actions_visibility_check;

alter table public.planned_actions
  add constraint planned_actions_visibility_check
  check (visibility in ('all', 'selected'));

create table if not exists public.planned_action_viewers (
  id uuid primary key default gen_random_uuid(),
  planned_action_id uuid not null references public.planned_actions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (planned_action_id, profile_id)
);

create index if not exists planned_action_viewers_profile_idx
  on public.planned_action_viewers(profile_id);

alter table public.planned_action_viewers enable row level security;

create or replace function public.can_view_planned_action(target_action_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.planned_actions action
    where action.id = target_action_id
      and (
        action.visibility = 'all'
        or action.created_by = auth.uid()
        or exists (
          select 1
          from public.planned_action_assignees assignee
          where assignee.planned_action_id = action.id
            and assignee.profile_id = auth.uid()
        )
        or exists (
          select 1
          from public.planned_action_viewers viewer
          where viewer.planned_action_id = action.id
            and viewer.profile_id = auth.uid()
        )
        or exists (
          select 1
          from public.profiles profile
          where profile.id = auth.uid()
            and profile.role = 'admin'
            and profile.active = true
        )
      )
  );
$$;

create or replace function public.can_manage_planned_action(target_action_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.planned_actions action
    where action.id = target_action_id
      and (
        action.created_by = auth.uid()
        or exists (
          select 1
          from public.profiles profile
          where profile.id = auth.uid()
            and profile.role in ('admin', 'vedouci_technik', 'sekretariat', 'servis')
            and profile.active = true
        )
      )
  );
$$;

revoke all on function public.can_view_planned_action(uuid) from public;
revoke all on function public.can_manage_planned_action(uuid) from public;
grant execute on function public.can_view_planned_action(uuid) to authenticated;
grant execute on function public.can_manage_planned_action(uuid) to authenticated;

drop policy if exists "authenticated can read planned actions" on public.planned_actions;
drop policy if exists "visible users can read planned actions" on public.planned_actions;
create policy "visible users can read planned actions"
on public.planned_actions for select
to authenticated
using (public.can_view_planned_action(id));

drop policy if exists "managers can update planned actions" on public.planned_actions;
drop policy if exists "allowed users can update planned actions" on public.planned_actions;
create policy "allowed users can update planned actions"
on public.planned_actions for update
to authenticated
using (public.can_manage_planned_action(id))
with check (public.can_manage_planned_action(id));

drop policy if exists "managers can delete planned actions" on public.planned_actions;
drop policy if exists "allowed users can delete planned actions" on public.planned_actions;
create policy "allowed users can delete planned actions"
on public.planned_actions for delete
to authenticated
using (public.can_manage_planned_action(id));

drop policy if exists "authenticated can read planned assignees" on public.planned_action_assignees;
drop policy if exists "visible users can read planned assignees" on public.planned_action_assignees;
create policy "visible users can read planned assignees"
on public.planned_action_assignees for select
to authenticated
using (public.can_view_planned_action(planned_action_id));

drop policy if exists "managers can manage planned assignees" on public.planned_action_assignees;
drop policy if exists "allowed users can manage planned assignees" on public.planned_action_assignees;
create policy "allowed users can manage planned assignees"
on public.planned_action_assignees for all
to authenticated
using (public.can_manage_planned_action(planned_action_id))
with check (public.can_manage_planned_action(planned_action_id));

drop policy if exists "visible users can read planned viewers" on public.planned_action_viewers;
create policy "visible users can read planned viewers"
on public.planned_action_viewers for select
to authenticated
using (public.can_view_planned_action(planned_action_id));

drop policy if exists "allowed users can manage planned viewers" on public.planned_action_viewers;
create policy "allowed users can manage planned viewers"
on public.planned_action_viewers for all
to authenticated
using (public.can_manage_planned_action(planned_action_id))
with check (public.can_manage_planned_action(planned_action_id));

-- Původně mohl mít člověk jen jeden stav. Nově má více samostatných záznamů.
alter table public.technician_availability
  add column if not exists id uuid default gen_random_uuid();

alter table public.technician_availability
  alter column id set default gen_random_uuid();

update public.technician_availability
set id = gen_random_uuid()
where id is null;

alter table public.technician_availability
  alter column id set not null;

alter table public.technician_availability
  drop constraint if exists technician_availability_pkey;

alter table public.technician_availability
  add constraint technician_availability_pkey primary key (id);

create index if not exists technician_availability_profile_idx
  on public.technician_availability(profile_id);

create index if not exists technician_availability_profile_dates_idx
  on public.technician_availability(profile_id, starts_on, ends_on);
