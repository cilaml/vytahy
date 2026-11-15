alter table public.profiles
  add column if not exists login_name text;

create unique index if not exists profiles_login_name_unique_idx
  on public.profiles(login_name)
  where login_name is not null;

alter table public.profiles
  drop constraint if exists profiles_login_name_format_check;

alter table public.profiles
  add constraint profiles_login_name_format_check
  check (
    login_name is null
    or login_name ~ '^[a-z0-9][a-z0-9._-]{2,31}$'
  );

comment on column public.profiles.login_name is
  'Optional normalized username for accounts that sign in without a real email address.';
