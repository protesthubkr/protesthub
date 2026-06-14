alter table public.public_events
  add column if not exists organizer_name text;

create index if not exists public_events_published_organizer_display_idx
  on public.public_events (
    (coalesce(nullif(btrim(organizer_name), ''), source_account_name)),
    id
  )
  where status = 'published';

drop view if exists public.public_event_cards;

create view public.public_event_cards
with (security_invoker = true) as
select
  e.id,
  e.title,
  e.venue,
  e.address,
  e.region,
  e.organizer_name,
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
from public.public_events e
left join public.event_dates d on d.event_id = e.id
group by e.id;

drop view if exists public.public_event_occurrences;

create view public.public_event_occurrences
with (security_invoker = true) as
select
  e.id,
  e.title,
  e.venue,
  e.region,
  coalesce(nullif(btrim(e.organizer_name), ''), e.source_account_name) as organizer_name,
  e.source_account_name,
  e.issue_tags,
  e.primary_issue,
  d.event_date as occurrence_date,
  d.start_time as occurrence_start_time
from public.public_events e
join public.event_dates d on d.event_id = e.id
where e.status = 'published';

create or replace function public.get_public_event_occurrence_window(
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
filtered_window_occurrences as (
  select
    e.id,
    e.title,
    e.venue,
    e.region,
    coalesce(nullif(btrim(e.organizer_name), ''), e.source_account_name) as organizer_name,
    e.source_account_name,
    e.issue_tags,
    e.primary_issue,
    d.event_date as occurrence_date,
    d.start_time as occurrence_start_time
  from params p
  join event_dates d
    on d.event_date >= p.window_start_date
   and d.event_date < p.window_end_date
  join public_events e on e.id = d.event_id
  where e.status = 'published'
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
      or coalesce(nullif(btrim(e.organizer_name), ''), e.source_account_name) = any(p.organizer_filters)
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
          'organizer_name', fo.organizer_name,
          'source_account_name', fo.source_account_name,
          'issue_tags', fo.issue_tags,
          'primary_issue', fo.primary_issue,
          'occurrence_date', fo.occurrence_date,
          'occurrence_start_time', fo.occurrence_start_time
        )
        order by fo.occurrence_date, fo.occurrence_start_time nulls last, fo.id
      )
      from filtered_window_occurrences fo
    ),
    '[]'::jsonb
  ) as events,
  exists (
    select 1
    from params p
    join event_dates d on d.event_date >= p.window_end_date
    join public_events e on e.id = d.event_id
    where e.status = 'published'
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
        or coalesce(nullif(btrim(e.organizer_name), ''), e.source_account_name) = any(p.organizer_filters)
      )
    limit 1
  ) as has_more_events,
  p.window_end_date as next_from_date,
  p.window_end_date as window_end_date,
  p.window_start_date as window_start_date
from params p;
$$;
