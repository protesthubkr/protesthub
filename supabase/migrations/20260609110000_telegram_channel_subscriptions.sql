create table if not exists public.telegram_channel_subscriptions (
  id uuid primary key default gen_random_uuid(),
  channel_username text not null unique,
  channel_title text,
  source_url text not null,
  status text not null default 'active'
    check (status in ('active', 'paused')),
  last_checked_at timestamptz,
  last_checked_message_id bigint,
  last_checked_message_at timestamptz,
  last_scan_started_at timestamptz,
  last_scan_finished_at timestamptz,
  last_scan_error text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_channel_subscriptions_status_checked_idx
  on public.telegram_channel_subscriptions (
    status,
    last_checked_at asc nulls first,
    channel_username
  );

create index if not exists telegram_channel_subscriptions_last_message_idx
  on public.telegram_channel_subscriptions (last_checked_message_id desc);

alter table public.telegram_channel_subscriptions enable row level security;
alter table public.telegram_channel_subscriptions force row level security;

revoke all on table public.telegram_channel_subscriptions
from public, anon, authenticated;
