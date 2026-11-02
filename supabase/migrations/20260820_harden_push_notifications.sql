create extension if not exists pgcrypto;

-- Jedno zařízení (endpoint) může v daný okamžik patřit jen jednomu účtu.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions
  add column if not exists user_agent text,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Starší implementace dovolovala stejný endpoint uložit více účtům. Ponechá se
-- nejnovější aktivní záznam, protože endpoint vždy označuje konkrétní zařízení.
with ranked_subscriptions as (
  select
    id,
    row_number() over (
      partition by endpoint
      order by active desc, updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_number
  from public.push_subscriptions
)
delete from public.push_subscriptions as subscription
using ranked_subscriptions as ranked
where subscription.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists push_subscriptions_endpoint_unique_idx
  on public.push_subscriptions(endpoint);

create index if not exists push_subscriptions_profile_active_idx
  on public.push_subscriptions(profile_id, active);

alter table public.push_subscriptions enable row level security;

-- Klíče odběru se do prohlížeče nikdy nečtou přímo. Veškerá obsluha probíhá
-- přes ověřené serverové route handlery se service role.
revoke all on table public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

-- Idempotence zabrání opakovanému rozeslání stejné nově založené poruchy.
create table if not exists public.push_notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  source_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists push_notification_events_source_idx
  on public.push_notification_events(event_type, source_id);

alter table public.push_notification_events enable row level security;

revoke all on table public.push_notification_events from anon, authenticated;
grant select, insert, update, delete on table public.push_notification_events to service_role;
