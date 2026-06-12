create table if not exists telegram_daily_broadcasts (
  id uuid primary key default gen_random_uuid(),
  broadcast_type text not null default 'no_events'
    check (broadcast_type in ('no_events')),
  target_date date not null,
  channel_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  telegram_message_id bigint,
  telegram_method text
    check (
      telegram_method is null
      or telegram_method = 'sendMessage'
    ),
  payload_hash text not null,
  error_message text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_daily_broadcasts_unique_type_channel_date
    unique (broadcast_type, channel_id, target_date),
  constraint telegram_daily_broadcasts_sent_fields_check
    check (
      status <> 'sent'
      or (
        telegram_message_id is not null
        and telegram_method is not null
        and sent_at is not null
      )
    )
);

create index if not exists telegram_daily_broadcasts_channel_status_created_idx
  on telegram_daily_broadcasts (channel_id, status, created_at desc);

create index if not exists telegram_daily_broadcasts_target_date_idx
  on telegram_daily_broadcasts (target_date, channel_id, status);

drop function if exists public.claim_telegram_daily_broadcast(text, text, date, text);

create function public.claim_telegram_daily_broadcast(
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
        telegram_message_id = null,
        telegram_method = null,
        payload_hash = excluded.payload_hash,
        error_message = null,
        attempt_count = telegram_daily_broadcasts.attempt_count + 1,
        locked_at = now(),
        sent_at = null,
        updated_at = now()
    where telegram_daily_broadcasts.status = 'failed'
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

alter table telegram_daily_broadcasts enable row level security;
alter table telegram_daily_broadcasts force row level security;

revoke all on table telegram_daily_broadcasts from public, anon, authenticated;

revoke execute on function public.claim_telegram_daily_broadcast(
  text,
  text,
  date,
  text
) from public, anon, authenticated;

grant execute on function public.claim_telegram_daily_broadcast(
  text,
  text,
  date,
  text
) to service_role;
