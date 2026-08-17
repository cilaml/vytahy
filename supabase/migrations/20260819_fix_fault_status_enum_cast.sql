-- Oprava změny stavu poruchy: faults.status je enum public.fault_status,
-- zatímco RPC přijímá text z klientské aplikace.

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
