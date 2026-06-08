drop view if exists public_event_cards;

alter table public_events
  drop column if exists description;

update x_event_candidates
set
  extraction_payload = jsonb_set(
    extraction_payload,
    '{structured_event}',
    (extraction_payload->'structured_event' - 'description')
      || jsonb_build_object('schema_version', 3),
    false
  ),
  updated_at = now()
where jsonb_typeof(extraction_payload->'structured_event') = 'object';

create view public_event_cards
with (security_invoker = true) as
select
  e.id,
  e.title,
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

revoke all on public_event_cards from public;
grant select on public_event_cards to anon, authenticated;
