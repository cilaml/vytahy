-- Checklisty nářadí mají vlastní akce oddělené od poruch a kalendáře.
-- Zároveň mohou obsahovat volně zapsané položky, které nejsou v evidenci nářadí.

alter table public.planned_actions
  add column if not exists tool_checklist_only boolean not null default false;

create index if not exists planned_actions_tool_checklist_only_idx
  on public.planned_actions(tool_checklist_only, starts_at desc);

-- Zachováme dosavadní checklisty, ale oddělíme je od běžného kalendáře.
update public.planned_actions as action
set tool_checklist_only = true
where exists (
  select 1
  from public.planned_action_tools as action_tool
  where action_tool.planned_action_id = action.id
);

create table if not exists public.tool_checklist_custom_items (
  id uuid primary key default gen_random_uuid(),
  planned_action_id uuid not null references public.planned_actions(id) on delete cascade,
  item_name text not null check (char_length(btrim(item_name)) between 1 and 160),
  prepared_at timestamptz,
  prepared_by uuid references public.profiles(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tool_checklist_custom_items_action_idx
  on public.tool_checklist_custom_items(planned_action_id, sort_order);

create table if not exists public.tool_checklist_template_custom_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.tool_checklist_templates(id) on delete cascade,
  item_name text not null check (char_length(btrim(item_name)) between 1 and 160),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tool_checklist_template_custom_items_template_idx
  on public.tool_checklist_template_custom_items(template_id, sort_order);

alter table public.tool_checklist_custom_items enable row level security;
alter table public.tool_checklist_template_custom_items enable row level security;

drop policy if exists "users with tools access read custom checklist items" on public.tool_checklist_custom_items;
create policy "users with tools access read custom checklist items"
on public.tool_checklist_custom_items for select
to authenticated
using (public.has_module_access('tools', 'view'));

drop policy if exists "users with tools manage custom checklist items" on public.tool_checklist_custom_items;
create policy "users with tools manage custom checklist items"
on public.tool_checklist_custom_items for all
to authenticated
using (public.has_module_access('tools', 'manage'))
with check (public.has_module_access('tools', 'manage'));

drop policy if exists "users with tools access read template custom items" on public.tool_checklist_template_custom_items;
create policy "users with tools access read template custom items"
on public.tool_checklist_template_custom_items for select
to authenticated
using (public.has_module_access('tools', 'view'));

drop policy if exists "users with tools manage template custom items" on public.tool_checklist_template_custom_items;
create policy "users with tools manage template custom items"
on public.tool_checklist_template_custom_items for all
to authenticated
using (public.has_module_access('tools', 'manage'))
with check (public.has_module_access('tools', 'manage'));

drop function if exists public.save_tool_checklist_action(
  uuid, text, timestamptz, timestamptz, text, uuid[], uuid[], text
);
drop function if exists public.save_tool_checklist_action(
  uuid, text, timestamptz, timestamptz, text, uuid[], uuid[], text[], text
);

create function public.save_tool_checklist_action(
  target_action_id uuid,
  action_title text,
  action_starts_at timestamptz,
  action_ends_at timestamptz,
  action_address text,
  assignee_ids uuid[],
  selected_tool_ids uuid[],
  custom_item_names text[],
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
  tool_count integer := coalesce(array_length(selected_tool_ids, 1), 0);
begin
  if not public.has_module_access('tools', 'manage') then
    raise exception 'Nemáte oprávnění připravovat nářadí.';
  end if;

  if tool_count + coalesce(array_length(custom_item_names, 1), 0) = 0 then
    raise exception 'Checklist musí obsahovat alespoň jednu položku.';
  end if;

  if target_action_id is null then
    if not public.has_module_access('planned_actions', 'manage') then
      raise exception 'Nemáte oprávnění vytvářet checklistové akce.';
    end if;

    if nullif(btrim(action_title), '') is null
      or action_starts_at is null
      or action_ends_at is null
      or action_ends_at < action_starts_at then
      raise exception 'Doplňte platný název a čas akce.';
    end if;

    insert into public.planned_actions (
      title, action_type, status, starts_at, ends_at, address,
      visibility, created_by, tool_checklist_only
    )
    values (
      btrim(action_title), 'servis', 'planovano', action_starts_at,
      action_ends_at, coalesce(btrim(action_address), ''), 'all', auth.uid(), true
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
        and action.tool_checklist_only = true
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
      raise exception 'Tento checklist nemůžete měnit.';
    end if;
  end if;

  delete from public.planned_action_tools
  where planned_action_id = saved_action_id
    and not (tool_id = any(coalesce(selected_tool_ids, '{}'::uuid[])));

  insert into public.planned_action_tools (
    planned_action_id, tool_id, sort_order
  )
  select
    saved_action_id,
    selected_tool_id,
    selected_position::integer - 1
  from unnest(coalesce(selected_tool_ids, '{}'::uuid[])) with ordinality
    as selected(selected_tool_id, selected_position)
  where exists (
    select 1 from public.tools where id = selected_tool_id
  )
  on conflict (planned_action_id, tool_id)
  do update set sort_order = excluded.sort_order;

  delete from public.tool_checklist_custom_items
  where planned_action_id = saved_action_id;

  insert into public.tool_checklist_custom_items (
    planned_action_id, item_name, sort_order
  )
  select
    saved_action_id,
    btrim(selected_item_name),
    tool_count + selected_position::integer - 1
  from unnest(coalesce(custom_item_names, '{}'::text[])) with ordinality
    as selected(selected_item_name, selected_position)
  where nullif(btrim(selected_item_name), '') is not null;

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
    from unnest(coalesce(selected_tool_ids, '{}'::uuid[])) with ordinality
      as selected(selected_tool_id, selected_position)
    where exists (
      select 1 from public.tools where id = selected_tool_id
    );

    insert into public.tool_checklist_template_custom_items (
      template_id, item_name, sort_order
    )
    select
      saved_template_id,
      btrim(selected_item_name),
      tool_count + selected_position::integer - 1
    from unnest(coalesce(custom_item_names, '{}'::text[])) with ordinality
      as selected(selected_item_name, selected_position)
    where nullif(btrim(selected_item_name), '') is not null;
  end if;

  return saved_action_id;
end;
$$;

revoke all on function public.save_tool_checklist_action(
  uuid, text, timestamptz, timestamptz, text, uuid[], uuid[], text[], text
) from public;
grant execute on function public.save_tool_checklist_action(
  uuid, text, timestamptz, timestamptz, text, uuid[], uuid[], text[], text
) to authenticated;

drop function if exists public.save_tool_checklist_template(text, uuid[]);
drop function if exists public.save_tool_checklist_template(text, uuid[], text[]);

create function public.save_tool_checklist_template(
  saved_template_name text,
  selected_tool_ids uuid[],
  custom_item_names text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_template_id uuid;
  tool_count integer := coalesce(array_length(selected_tool_ids, 1), 0);
begin
  if not public.has_module_access('tools', 'manage') then
    raise exception 'Nemáte oprávnění ukládat šablony nářadí.';
  end if;

  if nullif(btrim(saved_template_name), '') is null
    or tool_count + coalesce(array_length(custom_item_names, 1), 0) = 0 then
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
  from unnest(coalesce(selected_tool_ids, '{}'::uuid[])) with ordinality
    as selected(selected_tool_id, selected_position)
  where exists (
    select 1 from public.tools where id = selected_tool_id
  );

  insert into public.tool_checklist_template_custom_items (
    template_id, item_name, sort_order
  )
  select
    saved_template_id,
    btrim(selected_item_name),
    tool_count + selected_position::integer - 1
  from unnest(coalesce(custom_item_names, '{}'::text[])) with ordinality
    as selected(selected_item_name, selected_position)
  where nullif(btrim(selected_item_name), '') is not null;

  return saved_template_id;
end;
$$;

revoke all on function public.save_tool_checklist_template(text, uuid[], text[]) from public;
grant execute on function public.save_tool_checklist_template(text, uuid[], text[]) to authenticated;

comment on column public.planned_actions.tool_checklist_only is
  'Akce slouží pouze jako hlavička checklistu nářadí a nezobrazuje se v kalendáři ani mezi poruchami.';

comment on table public.tool_checklist_custom_items is
  'Volné položky checklistu, které nejsou vedené v evidenci nářadí.';
