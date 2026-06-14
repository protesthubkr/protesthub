create or replace function public.claim_telegram_event_broadcast(
  p_event_id text,
  p_channel_id text,
  p_occurrence_date date,
  p_payload_hash text
)
returns telegram_event_broadcasts
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed telegram_event_broadcasts;
begin
  if p_occurrence_date is null then
    raise exception 'occurrence_date is required';
  end if;

  insert into telegram_event_broadcasts (
    event_id,
    occurrence_date,
    channel_id,
    status,
    payload_hash,
    attempt_count,
    locked_at,
    updated_at
  )
  values (
    p_event_id,
    p_occurrence_date,
    p_channel_id,
    'pending',
    p_payload_hash,
    1,
    now(),
    now()
  )
  on conflict on constraint telegram_event_broadcasts_unique_event_channel_occurrence
  do update
    set status = 'pending',
        payload_hash = excluded.payload_hash,
        error_message = null,
        attempt_count = telegram_event_broadcasts.attempt_count + 1,
        locked_at = now(),
        sent_at = null,
        updated_at = now()
    where telegram_event_broadcasts.status = 'failed'
      or telegram_event_broadcasts.payload_hash is distinct from excluded.payload_hash
      or (
        telegram_event_broadcasts.status = 'pending'
        and coalesce(
          telegram_event_broadcasts.locked_at,
          telegram_event_broadcasts.updated_at,
          telegram_event_broadcasts.created_at
        ) < now() - interval '15 minutes'
      )
  returning * into claimed;

  return claimed;
end;
$$;

create or replace function public.claim_telegram_daily_broadcast(
  p_broadcast_type text,
  p_channel_id text,
  p_target_date date,
  p_payload_hash text
)
returns telegram_daily_broadcasts
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed telegram_daily_broadcasts;
begin
  if p_broadcast_type is null or p_broadcast_type not in ('no_events') then
    raise exception 'invalid broadcast_type';
  end if;

  if p_target_date is null then
    raise exception 'target_date is required';
  end if;

  insert into telegram_daily_broadcasts (
    broadcast_type,
    target_date,
    channel_id,
    status,
    payload_hash,
    attempt_count,
    locked_at,
    updated_at
  )
  values (
    p_broadcast_type,
    p_target_date,
    p_channel_id,
    'pending',
    p_payload_hash,
    1,
    now(),
    now()
  )
  on conflict on constraint telegram_daily_broadcasts_unique_type_channel_date
  do update
    set status = 'pending',
        payload_hash = excluded.payload_hash,
        error_message = null,
        attempt_count = telegram_daily_broadcasts.attempt_count + 1,
        locked_at = now(),
        sent_at = null,
        updated_at = now()
    where telegram_daily_broadcasts.status = 'failed'
      or telegram_daily_broadcasts.payload_hash is distinct from excluded.payload_hash
      or (
        telegram_daily_broadcasts.status = 'pending'
        and coalesce(
          telegram_daily_broadcasts.locked_at,
          telegram_daily_broadcasts.updated_at,
          telegram_daily_broadcasts.created_at
        ) < now() - interval '15 minutes'
      )
  returning * into claimed;

  return claimed;
end;
$$;
