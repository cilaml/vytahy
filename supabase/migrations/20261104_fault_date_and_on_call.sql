alter table public.faults
  add column if not exists fault_date date,
  add column if not exists is_on_call boolean not null default false;

-- Starším poruchám se provozní datum odvodí z času založení v českém čase.
update public.faults
set fault_date = (created_at at time zone 'Europe/Prague')::date
where fault_date is null;

alter table public.faults
  alter column fault_date set default ((now() at time zone 'Europe/Prague')::date),
  alter column fault_date set not null;

create index if not exists faults_fault_date_idx
  on public.faults(fault_date desc, created_at desc);
