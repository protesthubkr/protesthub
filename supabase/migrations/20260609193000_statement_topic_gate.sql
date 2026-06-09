create table if not exists public.statement_topic_embeddings (
  id uuid primary key default gen_random_uuid(),
  source_type text not null
    check (source_type in ('telegram', 'party')),
  source_summary_id uuid not null,
  embedding_model text not null,
  embedding_dimensions integer not null,
  content_hash text not null,
  embedding jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    source_type,
    source_summary_id,
    embedding_model,
    embedding_dimensions
  )
);

create index if not exists statement_topic_embeddings_source_idx
  on public.statement_topic_embeddings (source_type, source_summary_id);

create table if not exists public.statement_topics (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null unique,
  title text not null,
  status text not null default 'confirmed'
    check (status in ('candidate', 'confirmed', 'expired', 'ignored')),
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  telegram_source_count integer not null default 0,
  telegram_message_count integer not null default 0,
  representative_summary_id uuid,
  representative_source_url text,
  embedding_model text not null,
  embedding_dimensions integer not null,
  centroid_embedding jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists statement_topics_status_window_idx
  on public.statement_topics (status, window_ended_at desc);

create table if not exists public.statement_topic_links (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null
    references public.statement_topics(id)
    on delete cascade,
  source_type text not null
    check (source_type in ('telegram', 'party')),
  source_summary_id uuid not null,
  source_key text not null,
  source_url text not null,
  similarity numeric(6, 5) not null default 0,
  matched_by text not null default 'embedding'
    check (matched_by in ('embedding', 'rule', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (topic_id, source_type, source_summary_id)
);

create index if not exists statement_topic_links_source_idx
  on public.statement_topic_links (source_type, source_summary_id);

alter table public.party_statement_summaries
  add column if not exists topic_gate_status text not null default 'pending'
    check (
      topic_gate_status in (
        'pending',
        'matched',
        'unmatched',
        'manual_matched',
        'manual_hidden'
      )
    );

alter table public.party_statement_summaries
  add column if not exists matched_topic_id uuid
    references public.statement_topics(id)
    on delete set null;

alter table public.party_statement_summaries
  add column if not exists topic_match_confidence numeric(6, 5);

alter table public.party_statement_summaries
  add column if not exists topic_match_method text;

alter table public.party_statement_summaries
  add column if not exists topic_matched_at timestamptz;

create index if not exists party_statement_summaries_topic_gate_idx
  on public.party_statement_summaries (
    status,
    topic_gate_status,
    published_at desc nulls last
  );

alter table public.statement_topic_embeddings enable row level security;
alter table public.statement_topics enable row level security;
alter table public.statement_topic_links enable row level security;

alter table public.statement_topic_embeddings force row level security;
alter table public.statement_topics force row level security;
alter table public.statement_topic_links force row level security;

revoke all on table
  public.statement_topic_embeddings,
  public.statement_topics,
  public.statement_topic_links
from public, anon, authenticated;
