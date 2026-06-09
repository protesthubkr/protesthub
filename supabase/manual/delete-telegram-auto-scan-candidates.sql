-- Manual cleanup for Telegram subscription auto-scan candidates.
-- Scope:
--   - review_candidates.source_type = 'telegram'
--   - review_candidates.review_reason contains 'telegram_auto_scan'
-- This does not delete manually added Telegram link candidates.

begin;

create temp table cleanup_telegram_auto_scan_candidates on commit drop as
select
  id,
  media_keys
from public.review_candidates
where source_type = 'telegram'
  and review_reason @> array['telegram_auto_scan']::text[];

create temp table cleanup_telegram_auto_scan_media_keys on commit drop as
select distinct media.media_key
from cleanup_telegram_auto_scan_candidates candidate
cross join lateral unnest(candidate.media_keys) as media(media_key)
where media.media_key is not null
  and media.media_key <> '';

create temp table cleanup_telegram_auto_scan_summary (
  sort_order integer primary key,
  metric text not null,
  value bigint not null
) on commit drop;

insert into cleanup_telegram_auto_scan_summary (sort_order, metric, value)
select 10, 'candidates_matched', count(*)
from cleanup_telegram_auto_scan_candidates;

insert into cleanup_telegram_auto_scan_summary (sort_order, metric, value)
select 20, 'media_keys_matched', count(*)
from cleanup_telegram_auto_scan_media_keys;

insert into cleanup_telegram_auto_scan_summary (sort_order, metric, value)
select 30, 'public_events_matched', count(*)
from public.public_events event
where event.id in (
  select candidate.id::text
  from cleanup_telegram_auto_scan_candidates candidate
);

with deleted_public_events as (
  delete from public.public_events event
  where event.id in (
    select candidate.id::text
    from cleanup_telegram_auto_scan_candidates candidate
  )
  returning event.id
)
insert into cleanup_telegram_auto_scan_summary (sort_order, metric, value)
select 40, 'public_events_deleted', count(*)
from deleted_public_events;

with deleted_candidates as (
  delete from public.review_candidates candidate
  where candidate.id in (
    select target.id
    from cleanup_telegram_auto_scan_candidates target
  )
  returning candidate.id
)
insert into cleanup_telegram_auto_scan_summary (sort_order, metric, value)
select 50, 'candidates_deleted', count(*)
from deleted_candidates;

with deleted_media as (
  delete from public.source_media media
  where media.media_key in (
    select target.media_key
    from cleanup_telegram_auto_scan_media_keys target
  )
    and not exists (
      select 1
      from public.review_candidates candidate
      where media.media_key = any(candidate.media_keys)
    )
  returning media.media_key
)
insert into cleanup_telegram_auto_scan_summary (sort_order, metric, value)
select 60, 'orphan_media_deleted', count(*)
from deleted_media;

with reset_subscriptions as (
  update public.telegram_channel_subscriptions
  set
    last_checked_at = null,
    last_checked_message_id = null,
    last_checked_message_at = null,
    last_scan_started_at = null,
    last_scan_finished_at = null,
    last_scan_error = null,
    updated_at = now()
  where last_checked_at is not null
    or last_checked_message_id is not null
    or last_checked_message_at is not null
    or last_scan_started_at is not null
    or last_scan_finished_at is not null
    or last_scan_error is not null
  returning id
)
insert into cleanup_telegram_auto_scan_summary (sort_order, metric, value)
select 70, 'subscription_cursors_reset', count(*)
from reset_subscriptions;

select metric, value
from cleanup_telegram_auto_scan_summary
order by sort_order;

commit;
