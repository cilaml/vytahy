create extension if not exists pgcrypto;

-- Přístup se nastavuje po jednotlivých částech aplikace.
create table if not exists public.user_module_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  module text not null check (module in (
    'dashboard', 'planned_actions', 'faults', 'service', 'inspections',
    'messages', 'elevators', 'technicians', 'regions', 'tools', 'notifications'
  )),
  access_level text not null check (access_level in ('none', 'view', 'manage')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (profile_id, module)
);

alter table public.user_module_permissions enable row level security;

create or replace function public.default_module_access(profile_role text, target_module text)
returns text
language sql
immutable
as $$
  select case
    when profile_role in ('admin', 'vedouci_technik') then 'manage'
    when profile_role = 'sekretariat' and target_module in (
      'dashboard', 'planned_actions', 'faults', 'messages', 'technicians',
      'regions', 'notifications'
    ) then 'manage'
    when profile_role = 'sekretariat' then 'view'
    when profile_role = 'servis' and target_module in (
      'planned_actions', 'faults', 'service', 'messages', 'tools'
    ) then 'manage'
    when profile_role = 'servis' then 'view'
    when profile_role = 'technik' and target_module in (
      'planned_actions', 'faults', 'service', 'tools'
    ) then 'manage'
    when profile_role = 'technik' and target_module in (
      'dashboard', 'inspections', 'messages', 'elevators', 'regions', 'notifications'
    ) then 'view'
    else 'none'
  end;
$$;

create or replace function public.seed_profile_module_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_module_permissions (profile_id, module, access_level)
  select
    new.id,
    module_name,
    public.default_module_access(new.role::text, module_name)
  from unnest(array[
    'dashboard', 'planned_actions', 'faults', 'service', 'inspections',
    'messages', 'elevators', 'technicians', 'regions', 'tools', 'notifications'
  ]::text[]) as module_name
  on conflict (profile_id, module) do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_seed_module_permissions on public.profiles;
create trigger profiles_seed_module_permissions
after insert on public.profiles
for each row execute function public.seed_profile_module_permissions();

insert into public.user_module_permissions (profile_id, module, access_level)
select
  profile.id,
  module_name,
  public.default_module_access(profile.role::text, module_name)
from public.profiles as profile
cross join unnest(array[
  'dashboard', 'planned_actions', 'faults', 'service', 'inspections',
  'messages', 'elevators', 'technicians', 'regions', 'tools', 'notifications'
]::text[]) as module_name
on conflict (profile_id, module) do nothing;

create or replace function public.has_module_access(
  target_module text,
  required_level text default 'view'
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with current_profile as (
    select id, role::text as role
    from public.profiles
    where id = auth.uid()
      and active = true
  ), effective_access as (
    select
      current_profile.role,
      coalesce(
        permission.access_level,
        public.default_module_access(current_profile.role, target_module)
      ) as access_level
    from current_profile
    left join public.user_module_permissions as permission
      on permission.profile_id = current_profile.id
     and permission.module = target_module
  )
  select coalesce(bool_or(
    role = 'admin'
    or case access_level
      when 'manage' then 2
      when 'view' then 1
      else 0
    end >= case required_level
      when 'manage' then 2
      when 'view' then 1
      else 0
    end
  ), false)
  from effective_access;
$$;

revoke all on function public.has_module_access(text, text) from public;
grant execute on function public.has_module_access(text, text) to authenticated;

drop policy if exists "users read own module permissions" on public.user_module_permissions;
create policy "users read own module permissions"
on public.user_module_permissions for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  )
);

drop policy if exists "admins manage module permissions" on public.user_module_permissions;
create policy "admins manage module permissions"
on public.user_module_permissions for all
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  )
);

-- Restriktivní politiky ponechávají stávající řádková pravidla, ale zabrání
-- zápisu do části aplikace, ve které uživatel nemá úroveň „správa“.
do $$
declare
  guarded record;
  policy_name text;
begin
  for guarded in
    select * from (values
      ('planned_actions', 'planned_actions'),
      ('planned_action_assignees', 'planned_actions'),
      ('planned_action_viewers', 'planned_actions'),
      ('faults', 'faults'),
      ('fault_assignees', 'faults'),
      ('fault_notes', 'faults'),
      ('service_records', 'service'),
      ('inspection_events', 'inspections'),
      ('messages', 'messages'),
      ('message_reactions', 'messages'),
      ('elevators', 'elevators'),
      ('profiles', 'technicians'),
      ('profile_regions', 'technicians'),
      ('technician_availability', 'planned_actions'),
      ('regions', 'regions'),
      ('tools', 'tools'),
      ('tool_movements', 'tools'),
      ('planned_action_tools', 'tools')
    ) as mapping(table_name, module_name)
  loop
    if to_regclass(format('public.%I', guarded.table_name)) is null then
      continue;
    end if;

    policy_name := 'module write guard ' || guarded.module_name;
    execute format('drop policy if exists %I on public.%I', policy_name || ' insert', guarded.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (public.has_module_access(%L, %L))',
      policy_name || ' insert', guarded.table_name, guarded.module_name, 'manage'
    );

    execute format('drop policy if exists %I on public.%I', policy_name || ' update', guarded.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (public.has_module_access(%L, %L)) with check (public.has_module_access(%L, %L))',
      policy_name || ' update', guarded.table_name, guarded.module_name, 'manage', guarded.module_name, 'manage'
    );

    execute format('drop policy if exists %I on public.%I', policy_name || ' delete', guarded.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.has_module_access(%L, %L))',
      policy_name || ' delete', guarded.table_name, guarded.module_name, 'manage'
    );
  end loop;
end;
$$;

-- Stejná kontrola platí i pro čtení hlavních provozních tabulek. Díky tomu
-- nestačí obejít skryté menu a zavolat databázové API přímo z prohlížeče.
do $$
declare
  guarded record;
  policy_name text;
begin
  for guarded in
    select * from (values
      ('planned_actions', 'planned_actions'),
      ('planned_action_assignees', 'planned_actions'),
      ('planned_action_viewers', 'planned_actions'),
      ('faults', 'faults'),
      ('fault_assignees', 'faults'),
      ('fault_notes', 'faults'),
      ('service_records', 'service'),
      ('inspection_events', 'inspections'),
      ('messages', 'messages'),
      ('message_reactions', 'messages'),
      ('tools', 'tools'),
      ('tool_movements', 'tools'),
      ('planned_action_tools', 'tools')
    ) as mapping(table_name, module_name)
  loop
    if to_regclass(format('public.%I', guarded.table_name)) is null then
      continue;
    end if;

    policy_name := 'module read guard ' || guarded.module_name;
    execute format('drop policy if exists %I on public.%I', policy_name, guarded.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using (public.has_module_access(%L, %L))',
      policy_name, guarded.table_name, guarded.module_name, 'view'
    );
  end loop;
end;
$$;

-- Technické údaje výtahu se používají i uvnitř poruch, kalendáře, servisu a
-- prohlídek, i když uživatel nemá samostatný přístup do celé evidence výtahů.
drop policy if exists "module read guard elevators" on public.elevators;
create policy "module read guard elevators"
on public.elevators as restrictive for select
to authenticated
using (
  public.has_module_access('elevators', 'view')
  or public.has_module_access('planned_actions', 'view')
  or public.has_module_access('faults', 'view')
  or public.has_module_access('service', 'view')
  or public.has_module_access('inspections', 'view')
);

-- Dohledatelný okamžik dokončení práce.
alter table public.planned_actions
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles(id) on delete set null;

create index if not exists planned_actions_completed_at_idx
  on public.planned_actions(completed_at desc);

create or replace function public.set_planned_action_completion()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'hotovo' and old.status is distinct from 'hotovo' then
    new.completed_at = coalesce(new.completed_at, now());
    new.completed_by = coalesce(new.completed_by, auth.uid());
  elsif new.status <> 'hotovo' then
    new.completed_at = null;
    new.completed_by = null;
  end if;
  return new;
end;
$$;

drop trigger if exists planned_actions_set_completion on public.planned_actions;
create trigger planned_actions_set_completion
before update of status on public.planned_actions
for each row execute function public.set_planned_action_completion();

-- Technik může měnit stav práce, ke které je přiřazený, ale touto funkcí
-- nemůže upravovat její ostatní údaje ani ji smazat.
create or replace function public.set_planned_action_status(
  target_action_id uuid,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if next_status not in ('planovano', 'potvrzeno', 'na_ceste', 'rozpracovano', 'hotovo', 'zruseno') then
    raise exception 'Neplatný stav plánované akce.';
  end if;

  if not public.has_module_access('planned_actions', 'manage') then
    raise exception 'Nemáte oprávnění měnit stav plánované práce.';
  end if;

  if not exists (
    select 1
    from public.planned_actions as action
    where action.id = target_action_id
      and (
        action.created_by = auth.uid()
        or exists (
          select 1 from public.planned_action_assignees as assignee
          where assignee.planned_action_id = action.id
            and assignee.profile_id = auth.uid()
        )
        or exists (
          select 1 from public.profiles as profile
          where profile.id = auth.uid()
            and profile.active = true
            and profile.role in ('admin', 'vedouci_technik', 'sekretariat', 'servis')
        )
      )
  ) then
    raise exception 'Tuto plánovanou práci nemůžete měnit.';
  end if;

  update public.planned_actions
  set status = next_status
  where id = target_action_id;
end;
$$;

revoke all on function public.set_planned_action_status(uuid, text) from public;
grant execute on function public.set_planned_action_status(uuid, text) to authenticated;

-- Checklist konkrétní akce využívá existující vazbu nářadí na práci.
alter table public.planned_action_tools
  add column if not exists prepared_at timestamptz,
  add column if not exists prepared_by uuid references public.profiles(id) on delete set null,
  add column if not exists sort_order integer not null default 0;

create table if not exists public.tool_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.tool_checklist_templates(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete cascade,
  sort_order integer not null default 0,
  unique (template_id, tool_id)
);

create index if not exists tool_checklist_template_items_template_idx
  on public.tool_checklist_template_items(template_id, sort_order);

alter table public.tool_checklist_templates enable row level security;
alter table public.tool_checklist_template_items enable row level security;

drop policy if exists "users with tools access read checklist templates" on public.tool_checklist_templates;
create policy "users with tools access read checklist templates"
on public.tool_checklist_templates for select
to authenticated
using (public.has_module_access('tools', 'view'));

drop policy if exists "users with tools manage checklist templates" on public.tool_checklist_templates;
create policy "users with tools manage checklist templates"
on public.tool_checklist_templates for all
to authenticated
using (public.has_module_access('tools', 'manage'))
with check (public.has_module_access('tools', 'manage'));

drop policy if exists "users with tools access read checklist template items" on public.tool_checklist_template_items;
create policy "users with tools access read checklist template items"
on public.tool_checklist_template_items for select
to authenticated
using (public.has_module_access('tools', 'view'));

drop policy if exists "users with tools manage checklist template items" on public.tool_checklist_template_items;
create policy "users with tools manage checklist template items"
on public.tool_checklist_template_items for all
to authenticated
using (public.has_module_access('tools', 'manage'))
with check (public.has_module_access('tools', 'manage'));

-- Uložení celé přípravy proběhne v jedné transakci. Funkce umí buď vytvořit
-- novou plánovanou akci, nebo připojit checklist k existující viditelné akci.
create or replace function public.save_tool_checklist_action(
  target_action_id uuid,
  action_title text,
  action_starts_at timestamptz,
  action_ends_at timestamptz,
  action_address text,
  assignee_ids uuid[],
  selected_tool_ids uuid[],
  saved_template_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_action_id uuid;
  saved_template_id uuid;
begin
  if not public.has_module_access('tools', 'manage') then
    raise exception 'Nemáte oprávnění připravovat nářadí.';
  end if;

  if coalesce(array_length(selected_tool_ids, 1), 0) = 0 then
    raise exception 'Checklist musí obsahovat alespoň jednu položku.';
  end if;

  if target_action_id is null then
    if not public.has_module_access('planned_actions', 'manage') then
      raise exception 'Nemáte oprávnění vytvářet plánované akce.';
    end if;

    if nullif(btrim(action_title), '') is null
      or action_starts_at is null
      or action_ends_at is null
      or action_ends_at < action_starts_at then
      raise exception 'Doplňte platný název a čas akce.';
    end if;

    insert into public.planned_actions (
      title, action_type, status, starts_at, ends_at, address,
      visibility, created_by
    )
    values (
      btrim(action_title), 'servis', 'planovano', action_starts_at,
      action_ends_at, coalesce(btrim(action_address), ''), 'all', auth.uid()
    )
    returning id into saved_action_id;

    insert into public.planned_action_assignees (
      planned_action_id, profile_id, is_lead
    )
    select
      saved_action_id,
      selected_profile_id,
      row_number() over () = 1
    from unnest(coalesce(assignee_ids, '{}'::uuid[])) as selected_profile_id
    where exists (
      select 1 from public.profiles
      where id = selected_profile_id and active = true
    )
    on conflict (planned_action_id, profile_id) do nothing;
  else
    saved_action_id := target_action_id;

    if not exists (
      select 1
      from public.planned_actions as action
      where action.id = saved_action_id
        and (
          action.created_by = auth.uid()
          or public.can_manage_planned_action(action.id)
          or exists (
            select 1
            from public.planned_action_assignees as assignee
            where assignee.planned_action_id = action.id
              and assignee.profile_id = auth.uid()
          )
        )
    ) then
      raise exception 'K této akci nemůžete připravovat nářadí.';
    end if;
  end if;

  delete from public.planned_action_tools
  where planned_action_id = saved_action_id
    and not (tool_id = any(selected_tool_ids));

  insert into public.planned_action_tools (
    planned_action_id, tool_id, sort_order
  )
  select
    saved_action_id,
    selected_tool_id,
    selected_position::integer - 1
  from unnest(selected_tool_ids) with ordinality
    as selected(selected_tool_id, selected_position)
  where exists (
    select 1 from public.tools where id = selected_tool_id
  )
  on conflict (planned_action_id, tool_id)
  do update set sort_order = excluded.sort_order;

  if nullif(btrim(saved_template_name), '') is not null then
    insert into public.tool_checklist_templates (name, created_by)
    values (btrim(saved_template_name), auth.uid())
    returning id into saved_template_id;

    insert into public.tool_checklist_template_items (
      template_id, tool_id, sort_order
    )
    select
      saved_template_id,
      selected_tool_id,
      selected_position::integer - 1
    from unnest(selected_tool_ids) with ordinality
      as selected(selected_tool_id, selected_position)
    where exists (
      select 1 from public.tools where id = selected_tool_id
    );
  end if;

  return saved_action_id;
end;
$$;

revoke all on function public.save_tool_checklist_action(
  uuid, text, timestamptz, timestamptz, text, uuid[], uuid[], text
) from public;
grant execute on function public.save_tool_checklist_action(
  uuid, text, timestamptz, timestamptz, text, uuid[], uuid[], text
) to authenticated;

create or replace function public.save_tool_checklist_template(
  saved_template_name text,
  selected_tool_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_template_id uuid;
begin
  if not public.has_module_access('tools', 'manage') then
    raise exception 'Nemáte oprávnění ukládat šablony nářadí.';
  end if;

  if nullif(btrim(saved_template_name), '') is null
    or coalesce(array_length(selected_tool_ids, 1), 0) = 0 then
    raise exception 'Doplňte název šablony a alespoň jednu položku.';
  end if;

  insert into public.tool_checklist_templates (name, created_by)
  values (btrim(saved_template_name), auth.uid())
  returning id into saved_template_id;

  insert into public.tool_checklist_template_items (
    template_id, tool_id, sort_order
  )
  select
    saved_template_id,
    selected_tool_id,
    selected_position::integer - 1
  from unnest(selected_tool_ids) with ordinality
    as selected(selected_tool_id, selected_position)
  where exists (
    select 1 from public.tools where id = selected_tool_id
  );

  return saved_template_id;
end;
$$;

revoke all on function public.save_tool_checklist_template(text, uuid[]) from public;
grant execute on function public.save_tool_checklist_template(text, uuid[]) to authenticated;

comment on table public.user_module_permissions is
  'Individuální přístup uživatele k jednotlivým částem servisní aplikace.';

comment on table public.tool_checklist_templates is
  'Opakovaně použitelné šablony výběru nářadí pro plánované akce.';
