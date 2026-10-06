-- Wird app schema. All access goes through the Edge Functions (service role),
-- so RLS is enabled with no policies: the anon key can read nothing directly.

create table public.config (
  id          int primary key default 1 check (id = 1),
  start_date  date  not null default '2026-10-06',
  surah       text  not null default 'البقرة',
  -- one entry per day of the cycle; null f/t = verses not set yet
  ranges      jsonb not null default '[{"f":1,"t":95},{"f":null,"t":null},{"f":null,"t":null}]'
);
insert into public.config (id) values (1);

create table public.members (
  id              uuid primary key default gen_random_uuid(),
  handle          text not null unique,          -- instagram handle, no @
  pin_hash        text,                          -- null = not claimed yet
  pin_salt        text,
  failed_attempts int  not null default 0,
  locked_until    timestamptz,
  position        serial,
  created_at      timestamptz not null default now()
);

-- status 1 = finished, 2 = rest day (admin only, keeps the streak). No row = not done.
create table public.checkins (
  member_id uuid not null references public.members(id) on delete cascade,
  day       date not null,
  status    smallint not null check (status in (1, 2)),
  marked_at timestamptz not null default now(),
  primary key (member_id, day)
);
create index checkins_day_idx on public.checkins (day);

create table public.push_subs (
  endpoint         text primary key,
  member_id        uuid not null references public.members(id) on delete cascade,
  p256dh           text not null,
  auth             text not null,
  last_notified_at timestamptz,
  created_at       timestamptz not null default now()
);
create index push_subs_member_idx on public.push_subs (member_id);

-- Server-side secrets (token signing key, admin key, VAPID keys). Only the service role reads this.
-- Functions read an environment variable first and fall back to this table.
create table public.app_secrets (
  name  text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;

alter table public.config   enable row level security;
alter table public.members  enable row level security;
alter table public.checkins enable row level security;
alter table public.push_subs enable row level security;
