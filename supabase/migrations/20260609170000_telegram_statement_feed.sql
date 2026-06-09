alter table public.telegram_channel_subscriptions
  add column if not exists statement_feed_enabled boolean not null default false;

update public.telegram_channel_subscriptions
set statement_feed_enabled = true
where channel_username not in ('workers2016', 'platformc', 'leftall');

create table if not exists public.telegram_statement_scan_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  channels_seen integer not null default 0,
  messages_seen integer not null default 0,
  messages_written integer not null default 0,
  candidates_created integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists telegram_statement_scan_runs_started_at_idx
  on public.telegram_statement_scan_runs (started_at desc);

create table if not exists public.telegram_statement_scan_states (
  channel_username text primary key
    references public.telegram_channel_subscriptions(channel_username)
    on delete cascade,
  last_scanned_message_id bigint,
  last_scanned_message_at timestamptz,
  last_scanned_at timestamptz,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_statement_scan_states_scanned_idx
  on public.telegram_statement_scan_states (
    last_scanned_at asc nulls first,
    channel_username
  );

create table if not exists public.telegram_statement_messages (
  id uuid primary key default gen_random_uuid(),
  channel_username text not null
    references public.telegram_channel_subscriptions(channel_username)
    on delete cascade,
  message_id bigint not null,
  channel_title text not null,
  source_url text not null,
  message_created_at timestamptz,
  text_snapshot text not null default '',
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (channel_username, message_id)
);

create index if not exists telegram_statement_messages_created_idx
  on public.telegram_statement_messages (message_created_at desc nulls last);

create index if not exists telegram_statement_messages_channel_message_idx
  on public.telegram_statement_messages (channel_username, message_id desc);

create table if not exists public.telegram_statement_summaries (
  id uuid primary key default gen_random_uuid(),
  channel_username text not null
    references public.telegram_channel_subscriptions(channel_username)
    on delete cascade,
  message_id bigint not null,
  organization_name text not null,
  source_url text not null,
  message_created_at timestamptz,
  document_type text not null default 'position',
  core_sentence text,
  status text not null default 'pending'
    check (status in ('pending', 'extracted', 'skipped', 'failed')),
  detection_reason text[] not null default '{}',
  extraction_confidence integer,
  extraction_reason text,
  core_sentence_start integer,
  core_sentence_end integer,
  model text,
  prompt_version text,
  attempt_count integer not null default 0,
  last_error text,
  extracted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_username, message_id)
);

create index if not exists telegram_statement_summaries_status_created_idx
  on public.telegram_statement_summaries (status, message_created_at desc nulls last);

create index if not exists telegram_statement_summaries_channel_message_idx
  on public.telegram_statement_summaries (channel_username, message_id desc);

alter table public.telegram_statement_scan_runs enable row level security;
alter table public.telegram_statement_scan_states enable row level security;
alter table public.telegram_statement_messages enable row level security;
alter table public.telegram_statement_summaries enable row level security;

alter table public.telegram_statement_scan_runs force row level security;
alter table public.telegram_statement_scan_states force row level security;
alter table public.telegram_statement_messages force row level security;
alter table public.telegram_statement_summaries force row level security;

revoke all on table
  public.telegram_statement_scan_runs,
  public.telegram_statement_scan_states,
  public.telegram_statement_messages,
  public.telegram_statement_summaries
from public, anon, authenticated;

grant select on table public.telegram_statement_summaries
to anon, authenticated;

drop policy if exists telegram_statement_summaries_read_extracted
  on public.telegram_statement_summaries;

create policy telegram_statement_summaries_read_extracted
  on public.telegram_statement_summaries
  for select
  to anon, authenticated
  using (status = 'extracted');
