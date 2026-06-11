begin;

alter table if exists public.telegram_channel_subscriptions
  drop column if exists statement_feed_enabled;

drop view if exists public.public_statement_feed_items cascade;
drop table if exists public.statement_sentence_llm_selections cascade;

drop table if exists public.statement_topic_links cascade;
drop table if exists public.statement_topics cascade;
drop table if exists public.statement_topic_embeddings cascade;

drop table if exists public.party_statement_summaries cascade;
drop table if exists public.party_statement_documents cascade;
drop table if exists public.party_statement_sources cascade;

drop table if exists public.telegram_statement_summaries cascade;
drop table if exists public.telegram_statement_extraction_batches cascade;
drop table if exists public.telegram_statement_messages cascade;
drop table if exists public.telegram_statement_scan_states cascade;
drop table if exists public.telegram_statement_scan_runs cascade;

commit;
