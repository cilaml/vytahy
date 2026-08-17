-- Poruchy jsou řádkově omezené: servis a technik vidí jen vlastní práci,
-- zatímco admin, vedoucí technik a sekretariát fungují jako dispečink.

create or replace function public.is_fault_dispatcher()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('admin', 'vedouci_technik', 'sekretariat')
  );
$$;

create or replace function public.can_delete_faults()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('admin', 'vedouci_technik')
  );
$$;

create or replace function public.can_view_fault(target_fault_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.faults as fault
    where fault.id = target_fault_id
      and (
        public.is_fault_dispatcher()
        or fault.created_by = auth.uid()
        or fault.main_technician_id = auth.uid()
        or exists (
          select 1
          from public.fault_assignees as assignee
          where assignee.fault_id = fault.id
            and assignee.profile_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_work_on_fault(target_fault_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_module_access('faults', 'manage')
    and exists (
      select 1
      from public.faults as fault
      where fault.id = target_fault_id
        and fault.status <> 'archivovano'
        and (
          public.is_fault_dispatcher()
          or fault.created_by = auth.uid()
          or fault.main_technician_id = auth.uid()
          or exists (
            select 1
            from public.fault_assignees as assignee
            where assignee.fault_id = fault.id
              and assignee.profile_id = auth.uid()
          )
        )
    );
$$;

revoke all on function public.is_fault_dispatcher() from public;
revoke all on function public.can_delete_faults() from public;
revoke all on function public.can_view_fault(uuid) from public;
revoke all on function public.can_work_on_fault(uuid) from public;
grant execute on function public.is_fault_dispatcher() to authenticated;
grant execute on function public.can_delete_faults() to authenticated;
grant execute on function public.can_view_fault(uuid) to authenticated;
grant execute on function public.can_work_on_fault(uuid) to authenticated;

-- Tato pravidla jsou RESTRICTIVE, takže doplňují stávající RLS a nejdou
-- obejít jinou starší povolovací politikou.
drop policy if exists "fault row visibility guard" on public.faults;
create policy "fault row visibility guard"
on public.faults as restrictive for select
to authenticated
using (public.can_view_fault(id));

drop policy if exists "fault creator insert guard" on public.faults;
create policy "fault creator insert guard"
on public.faults as restrictive for insert
to authenticated
with check (
  public.has_module_access('faults', 'manage')
  and created_by = auth.uid()
  and (
    public.is_fault_dispatcher()
    or main_technician_id is null
    or main_technician_id = auth.uid()
  )
);

-- Přímou editaci celé poruchy má jen dispečink. Technik mění stav pouze přes
-- níže uvedenou RPC funkci, takže nemůže přepsat přiřazení nebo cizí údaje.
drop policy if exists "fault dispatcher update guard" on public.faults;
create policy "fault dispatcher update guard"
on public.faults as restrictive for update
to authenticated
using (public.is_fault_dispatcher())
with check (public.is_fault_dispatcher());

drop policy if exists "fault delete manager guard" on public.faults;
create policy "fault delete manager guard"
on public.faults as restrictive for delete
to authenticated
using (
  public.has_module_access('faults', 'manage')
  and public.can_delete_faults()
);

drop policy if exists "fault assignee visibility guard" on public.fault_assignees;
create policy "fault assignee visibility guard"
on public.fault_assignees as restrictive for select
to authenticated
using (public.can_view_fault(fault_id));

drop policy if exists "fault assignee dispatcher insert guard" on public.fault_assignees;
create policy "fault assignee dispatcher insert guard"
on public.fault_assignees as restrictive for insert
to authenticated
with check (
  public.has_module_access('faults', 'manage')
  and public.is_fault_dispatcher()
);

drop policy if exists "fault assignee dispatcher update guard" on public.fault_assignees;
create policy "fault assignee dispatcher update guard"
on public.fault_assignees as restrictive for update
to authenticated
using (public.is_fault_dispatcher())
with check (public.is_fault_dispatcher());

drop policy if exists "fault assignee dispatcher delete guard" on public.fault_assignees;
create policy "fault assignee dispatcher delete guard"
on public.fault_assignees as restrictive for delete
to authenticated
using (public.is_fault_dispatcher());

drop policy if exists "fault note visibility guard" on public.fault_notes;
create policy "fault note visibility guard"
on public.fault_notes as restrictive for select
to authenticated
using (public.can_view_fault(fault_id));

drop policy if exists "fault note author insert guard" on public.fault_notes;
create policy "fault note author insert guard"
on public.fault_notes as restrictive for insert
to authenticated
with check (
  profile_id = auth.uid()
  and public.can_work_on_fault(fault_id)
);

drop policy if exists "fault note dispatcher update guard" on public.fault_notes;
create policy "fault note dispatcher update guard"
on public.fault_notes as restrictive for update
to authenticated
using (public.is_fault_dispatcher())
with check (public.is_fault_dispatcher());

drop policy if exists "fault note dispatcher delete guard" on public.fault_notes;
create policy "fault note dispatcher delete guard"
on public.fault_notes as restrictive for delete
to authenticated
using (public.is_fault_dispatcher());

create or replace function public.set_fault_status(
  target_fault_id uuid,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if next_status not in (
    'nova', 'prirazeno', 'na_ceste', 'rozpracovano', 'ceka_na_dil',
    'ceka_na_spravce', 'ceka_na_pristup', 'ceka_na_zakaznika',
    'hotovo', 'archivovano'
  ) then
    raise exception 'Neplatný stav poruchy.';
  end if;

  if not public.can_work_on_fault(target_fault_id) then
    raise exception 'Tuto poruchu nemůžete měnit.';
  end if;

  if next_status = 'archivovano' and not public.is_fault_dispatcher() then
    raise exception 'Archivovat poruchy může jen dispečink.';
  end if;

  update public.faults
  set
    status = next_status::public.fault_status,
    finished_at = case
      when next_status = 'hotovo' then coalesce(finished_at, now())
      when next_status <> 'archivovano' then null
      else finished_at
    end,
    archived_at = case
      when next_status = 'archivovano' then coalesce(archived_at, now())
      else null
    end,
    updated_at = now()
  where id = target_fault_id;
end;
$$;

revoke all on function public.set_fault_status(uuid, text) from public;
grant execute on function public.set_fault_status(uuid, text) to authenticated;

comment on function public.can_view_fault(uuid) is
  'Dispečink vidí všechny poruchy; ostatní jen vytvořené nebo přiřazené.';
