create table if not exists public.telegram_statement_extraction_batches (
  id uuid primary key default gen_random_uuid(),
  openai_batch_id text unique,
  input_file_id text,
  output_file_id text,
  error_file_id text,
  status text not null default 'preparing'
    check (
      status in (
        'preparing',
        'submitted',
        'validating',
        'in_progress',
        'finalizing',
        'completed',
        'failed',
        'expired',
        'cancelling',
        'cancelled'
      )
    ),
  request_count integer not null default 0,
  rule_extracted_count integer not null default 0,
  skipped_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists telegram_statement_extraction_batches_openai_idx
  on public.telegram_statement_extraction_batches (openai_batch_id);

create index if not exists telegram_statement_extraction_batches_status_idx
  on public.telegram_statement_extraction_batches (status, created_at desc);

alter table public.telegram_statement_summaries
  add column if not exists batch_id uuid
    references public.telegram_statement_extraction_batches(id)
    on delete set null;

alter table public.telegram_statement_summaries
  add column if not exists batch_custom_id text;

alter table public.telegram_statement_summaries
  drop constraint if exists telegram_statement_summaries_status_check;

alter table public.telegram_statement_summaries
  add constraint telegram_statement_summaries_status_check
  check (status in ('pending', 'queued', 'extracted', 'skipped', 'failed'));

create index if not exists telegram_statement_summaries_batch_idx
  on public.telegram_statement_summaries (batch_id);

alter table public.telegram_statement_extraction_batches enable row level security;
alter table public.telegram_statement_extraction_batches force row level security;

revoke all on table public.telegram_statement_extraction_batches
from public, anon, authenticated;
