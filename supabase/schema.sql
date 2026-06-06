create table if not exists source_accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  handle text not null unique,
  is_active boolean not null default true,
  default_issues text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public_events (
  id text primary key,
  title text not null,
  description text,
  venue text not null,
  address text not null,
  region text not null,
  source_account_id uuid references source_accounts(id),
  source_account_name text not null,
  source_post_url text not null,
  cancel_source_url text,
  issue_tags text[] not null,
  primary_issue text not null,
  status text not null check (status in ('published', 'canceled')),
  last_checked_at timestamptz not null default now(),
  poster_image_url text,
  created_at timestamptz not null default now()
);

create table if not exists event_dates (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public_events(id) on delete cascade,
  event_date date not null,
  start_time time,
  created_at timestamptz not null default now()
);

create index if not exists event_dates_date_time_idx
  on event_dates (event_date, start_time);

create index if not exists event_dates_event_id_date_time_idx
  on event_dates (event_id, event_date, start_time);

create index if not exists event_dates_date_time_event_id_idx
  on event_dates (event_date, start_time, event_id);

create index if not exists public_events_status_region_idx
  on public_events (status, region);

create index if not exists public_events_status_source_account_idx
  on public_events (status, source_account_name);

create index if not exists public_events_issue_tags_idx
  on public_events using gin (issue_tags);

create index if not exists public_events_published_region_id_idx
  on public_events (region, id)
  where status = 'published';

create index if not exists public_events_published_source_account_id_idx
  on public_events (source_account_name, id)
  where status = 'published';

create index if not exists public_events_published_issue_tags_idx
  on public_events using gin (issue_tags)
  where status = 'published';

create table if not exists x_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  strategy text not null default 'following_user_timelines',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  accounts_seen integer not null default 0,
  posts_seen integer not null default 0,
  posts_written integer not null default 0,
  candidates_created integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists x_ingest_runs_started_at_idx
  on x_ingest_runs (started_at desc);

create table if not exists x_accounts (
  x_user_id text primary key,
  username text not null,
  account_name text not null,
  source_account_id uuid references source_accounts(id),
  is_following boolean not null default true,
  is_protected boolean not null default false,
  is_verified boolean,
  default_issues text[] not null default '{}',
  last_ingested_at timestamptz,
  last_ingested_post_id text,
  last_ingested_post_created_at timestamptz,
  last_ingest_run_id uuid references x_ingest_runs(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb
);

alter table x_accounts
  add column if not exists last_ingested_at timestamptz,
  add column if not exists last_ingested_post_id text,
  add column if not exists last_ingested_post_created_at timestamptz,
  add column if not exists last_ingest_run_id uuid references x_ingest_runs(id);

create unique index if not exists x_accounts_username_lower_idx
  on x_accounts (lower(username));

create index if not exists x_accounts_following_idx
  on x_accounts (is_following, is_protected);

create table if not exists x_posts (
  x_post_id text primary key,
  author_x_user_id text not null references x_accounts(x_user_id),
  text text not null default '',
  created_at timestamptz,
  conversation_id text,
  source_post_url text not null,
  referenced_posts jsonb not null default '[]'::jsonb,
  edit_history_post_ids text[] not null default '{}',
  attachment_media_keys text[] not null default '{}',
  entities jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_ingest_run_id uuid references x_ingest_runs(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists x_posts_author_created_at_idx
  on x_posts (author_x_user_id, created_at desc);

create index if not exists x_posts_created_at_idx
  on x_posts (created_at desc);

create table if not exists x_media (
  media_key text primary key,
  media_type text not null,
  url text,
  preview_image_url text,
  width integer,
  height integer,
  alt_text text,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists x_media_type_idx
  on x_media (media_type);

create table if not exists x_post_media (
  x_post_id text not null references x_posts(x_post_id) on delete cascade,
  media_key text not null references x_media(media_key) on delete cascade,
  media_order integer not null default 0,
  primary key (x_post_id, media_key)
);

create table if not exists x_event_candidates (
  id uuid primary key default gen_random_uuid(),
  x_post_id text not null unique references x_posts(x_post_id) on delete cascade,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'ignored', 'published', 'canceled', 'duplicate')),
  source_account_name text not null,
  source_post_url text not null,
  text_snapshot text not null default '',
  media_keys text[] not null default '{}',
  ocr_text text,
  extraction_payload jsonb not null default '{}'::jsonb,
  candidate_reason text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists x_event_candidates_status_created_idx
  on x_event_candidates (status, created_at desc);

create index if not exists x_event_candidates_media_keys_idx
  on x_event_candidates using gin (media_keys);

create or replace view public_event_cards as
select
  e.id,
  e.title,
  e.description,
  e.venue,
  e.address,
  e.region,
  e.source_account_name,
  e.source_post_url,
  e.cancel_source_url,
  e.issue_tags,
  e.primary_issue,
  e.status,
  e.last_checked_at,
  e.poster_image_url,
  coalesce(
    json_agg(
      json_build_object(
        'date', d.event_date::text,
        'start_time', to_char(d.start_time, 'HH24:MI')
      )
      order by d.event_date, d.start_time nulls last
    ) filter (where d.id is not null),
    '[]'::json
  ) as dates
from public_events e
left join event_dates d on d.event_id = e.id
group by e.id;

drop view if exists public_event_occurrences;

create view public_event_occurrences as
select
  e.id,
  e.title,
  e.venue,
  e.region,
  e.source_account_name,
  e.issue_tags,
  e.primary_issue,
  d.event_date as occurrence_date,
  d.start_time as occurrence_start_time
from public_events e
join event_dates d on d.event_id = e.id
where e.status = 'published';

drop function if exists public.get_public_event_occurrence_window(
  date,
  integer,
  text[],
  text[],
  text[]
);

create function public.get_public_event_occurrence_window(
  p_from_date date,
  p_window_days integer default 7,
  p_issue_filters text[] default '{}'::text[],
  p_region_filters text[] default '{}'::text[],
  p_organizer_filters text[] default '{}'::text[]
)
returns table (
  events jsonb,
  has_more_events boolean,
  next_from_date date,
  window_end_date date,
  window_start_date date
)
language sql
stable
security invoker
set search_path = public
as $$
with params as (
  select
    p_from_date as window_start_date,
    (p_from_date + p_window_days)::date as window_end_date,
    coalesce(p_issue_filters, '{}'::text[]) as issue_filters,
    coalesce(p_region_filters, '{}'::text[]) as region_filters,
    coalesce(p_organizer_filters, '{}'::text[]) as organizer_filters
),
filtered_occurrences as (
  select
    e.id,
    e.title,
    e.venue,
    e.region,
    e.source_account_name,
    e.issue_tags,
    e.primary_issue,
    d.event_date as occurrence_date,
    d.start_time as occurrence_start_time
  from event_dates d
  join public_events e on e.id = d.event_id
  cross join params p
  where e.status = 'published'
    and d.event_date >= p.window_start_date
    and (
      cardinality(p.issue_filters) = 0
      or e.issue_tags && p.issue_filters
    )
    and (
      cardinality(p.region_filters) = 0
      or e.region = any(p.region_filters)
    )
    and (
      cardinality(p.organizer_filters) = 0
      or e.source_account_name = any(p.organizer_filters)
    )
)
select
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', fo.id,
          'title', fo.title,
          'venue', fo.venue,
          'region', fo.region,
          'source_account_name', fo.source_account_name,
          'issue_tags', fo.issue_tags,
          'primary_issue', fo.primary_issue,
          'occurrence_date', fo.occurrence_date,
          'occurrence_start_time', fo.occurrence_start_time
        )
        order by fo.occurrence_date, fo.occurrence_start_time nulls last, fo.id
      )
      from filtered_occurrences fo
      where fo.occurrence_date >= p.window_start_date
        and fo.occurrence_date < p.window_end_date
    ),
    '[]'::jsonb
  ) as events,
  exists (
    select 1
    from filtered_occurrences fo
    where fo.occurrence_date >= p.window_end_date
  ) as has_more_events,
  p.window_end_date as next_from_date,
  p.window_end_date as window_end_date,
  p.window_start_date as window_start_date
from params p;
$$;
