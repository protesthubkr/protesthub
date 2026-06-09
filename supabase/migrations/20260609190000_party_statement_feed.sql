create table if not exists public.party_statement_sources (
  source_key text primary key,
  organization_name text not null,
  list_url text not null,
  enabled boolean not null default true,
  last_scanned_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.party_statement_sources (
  source_key,
  organization_name,
  list_url,
  enabled
)
values
  (
    'people_power_party',
    '국민의힘',
    'https://www.peoplepowerparty.kr/news/comment',
    true
  ),
  (
    'theminjoo',
    '더불어민주당',
    'https://theminjoo.kr/main/sub/news/list.php?brd=188',
    true
  ),
  (
    'reform_party',
    '개혁신당',
    'https://www.reformparty.kr/briefing',
    true
  )
on conflict (source_key) do update
set
  enabled = excluded.enabled,
  list_url = excluded.list_url,
  organization_name = excluded.organization_name,
  updated_at = now();

create table if not exists public.party_statement_documents (
  id uuid primary key default gen_random_uuid(),
  source_key text not null
    references public.party_statement_sources(source_key)
    on delete cascade,
  external_id text not null,
  organization_name text not null,
  source_url text not null,
  title text not null,
  document_type text not null default 'position',
  published_at timestamptz,
  text_snapshot text not null default '',
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_key, external_id)
);

create index if not exists party_statement_documents_published_idx
  on public.party_statement_documents (published_at desc nulls last);

create index if not exists party_statement_documents_source_idx
  on public.party_statement_documents (source_key, external_id);

create table if not exists public.party_statement_summaries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null
    references public.party_statement_documents(id)
    on delete cascade,
  source_key text not null
    references public.party_statement_sources(source_key)
    on delete cascade,
  organization_name text not null,
  source_url text not null,
  title text not null,
  published_at timestamptz,
  document_type text not null default 'position',
  core_sentence text,
  status text not null default 'pending'
    check (status in ('pending', 'extracted', 'skipped', 'failed')),
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
  unique (document_id)
);

create index if not exists party_statement_summaries_status_published_idx
  on public.party_statement_summaries (status, published_at desc nulls last);

create index if not exists party_statement_summaries_source_idx
  on public.party_statement_summaries (source_key, published_at desc nulls last);

alter table public.party_statement_sources enable row level security;
alter table public.party_statement_documents enable row level security;
alter table public.party_statement_summaries enable row level security;

alter table public.party_statement_sources force row level security;
alter table public.party_statement_documents force row level security;
alter table public.party_statement_summaries force row level security;

revoke all on table
  public.party_statement_sources,
  public.party_statement_documents,
  public.party_statement_summaries
from public, anon, authenticated;

grant select on table public.party_statement_summaries
to anon, authenticated;

drop policy if exists party_statement_summaries_read_extracted
  on public.party_statement_summaries;

create policy party_statement_summaries_read_extracted
  on public.party_statement_summaries
  for select
  to anon, authenticated
  using (status = 'extracted');
