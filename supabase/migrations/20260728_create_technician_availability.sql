create table if not exists public.technician_availability (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null check (status in ('dovolena', 'nemoc', 'jine')),
  starts_on date not null default current_date,
  ends_on date,
  note text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint technician_availability_valid_dates
    check (ends_on is null or ends_on >= starts_on)
);

create index if not exists technician_availability_dates_idx
  on public.technician_availability(starts_on, ends_on);

alter table public.technician_availability enable row level security;

create or replace function public.can_manage_technician_availability(target_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    auth.uid() = target_profile_id
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'vedouci_technik', 'sekretariat')
        and p.active = true
    );
$$;

grant execute on function public.can_manage_technician_availability(uuid) to authenticated;

drop policy if exists "authenticated can read technician availability"
  on public.technician_availability;
create policy "authenticated can read technician availability"
on public.technician_availability for select
to authenticated
using (true);

drop policy if exists "allowed users can insert technician availability"
  on public.technician_availability;
create policy "allowed users can insert technician availability"
on public.technician_availability for insert
to authenticated
with check (public.can_manage_technician_availability(profile_id));

drop policy if exists "allowed users can update technician availability"
  on public.technician_availability;
create policy "allowed users can update technician availability"
on public.technician_availability for update
to authenticated
using (public.can_manage_technician_availability(profile_id))
with check (public.can_manage_technician_availability(profile_id));

drop policy if exists "allowed users can delete technician availability"
  on public.technician_availability;
create policy "allowed users can delete technician availability"
on public.technician_availability for delete
to authenticated
using (public.can_manage_technician_availability(profile_id));

create or replace function public.set_technician_availability_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists technician_availability_set_updated_at
  on public.technician_availability;
create trigger technician_availability_set_updated_at
before update on public.technician_availability
for each row execute function public.set_technician_availability_updated_at();
