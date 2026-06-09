do $$
begin
  if to_regclass('public.x_event_candidates') is not null
    and to_regclass('public.review_candidates') is null then
    alter table public.x_event_candidates rename to review_candidates;
  end if;
end $$;

do $$
begin
  if to_regclass('public.x_media') is not null
    and to_regclass('public.source_media') is null then
    alter table public.x_media rename to source_media;
  end if;
end $$;

alter table if exists public.source_media
  add column if not exists source_type text not null default 'x';

alter table if exists public.source_media
  drop constraint if exists source_media_source_type_check,
  add constraint source_media_source_type_check
    check (source_type in ('x', 'telegram'));

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'review_candidates'
      and column_name = 'x_post_id'
  ) then
    alter table public.review_candidates rename column x_post_id to source_record_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'review_candidates'
      and column_name = 'source_account_name'
  ) then
    alter table public.review_candidates rename column source_account_name to source_name;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'review_candidates'
      and column_name = 'source_post_url'
  ) then
    alter table public.review_candidates rename column source_post_url to source_url;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'review_candidates'
      and column_name = 'candidate_reason'
  ) then
    alter table public.review_candidates rename column candidate_reason to review_reason;
  end if;
end $$;

alter table if exists public.review_candidates
  add column if not exists source_type text not null default 'x';

alter table if exists public.review_candidates
  drop constraint if exists review_candidates_source_type_check,
  add constraint review_candidates_source_type_check
    check (source_type in ('x', 'telegram'));

do $$
begin
  if to_regclass('public.review_candidates') is not null then
    update public.review_candidates
    set source_type = coalesce(nullif(source_type, ''), 'x')
    where source_type is null or source_type = '';
  end if;
end $$;

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'public.review_candidates'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) like '%x_posts%';

  if constraint_name is not null then
    execute format(
      'alter table public.review_candidates drop constraint %I',
      constraint_name
    );
  end if;
end $$;

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'public.review_candidates'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) like '%source_record_id%';

  if constraint_name is not null then
    execute format(
      'alter table public.review_candidates drop constraint %I',
      constraint_name
    );
  end if;
end $$;

drop index if exists public.review_candidates_source_unique_idx;
create unique index review_candidates_source_unique_idx
  on public.review_candidates (source_type, source_record_id);

alter index if exists public.x_event_candidates_status_created_idx
  rename to review_candidates_status_created_idx;

alter index if exists public.x_event_candidates_media_keys_idx
  rename to review_candidates_media_keys_idx;

alter index if exists public.x_media_type_idx
  rename to source_media_type_idx;
