alter table public.faults
  add column if not exists custom_elevator_label text;

alter table public.faults
  alter column elevator_id drop not null;

alter table public.faults
  drop constraint if exists faults_elevator_source_check;

alter table public.faults
  add constraint faults_elevator_source_check check (
    (
      elevator_id is not null
      and nullif(btrim(custom_elevator_label), '') is null
    )
    or
    (
      elevator_id is null
      and nullif(btrim(custom_elevator_label), '') is not null
    )
  );

comment on column public.faults.custom_elevator_label is
  'Free-text lift or location used when the fault is not linked to an elevator record.';
