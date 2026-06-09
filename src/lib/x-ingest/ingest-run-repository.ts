import type { SupabaseClient } from "@supabase/supabase-js";
import { formatError } from "./repository-utils";

const INGEST_STRATEGY = "following_user_timelines";

export type IngestCounters = {
  accountsSeen: number;
  postsSeen: number;
  postsWritten: number;
  candidatesCreated: number;
  candidatesPromoted: number;
  ignoredCandidatesCreated: number;
  needsReviewCandidatesCreated: number;
};

export function createEmptyIngestCounters(): IngestCounters {
  return {
    accountsSeen: 0,
    postsSeen: 0,
    postsWritten: 0,
    candidatesCreated: 0,
    candidatesPromoted: 0,
    ignoredCandidatesCreated: 0,
    needsReviewCandidatesCreated: 0,
  };
}

export async function createIngestRun(
  supabase: SupabaseClient,
  metadata: Record<string, unknown>,
  strategy = INGEST_STRATEGY,
) {
  const { data, error } = await supabase
    .from("x_ingest_runs")
    .insert({
      status: "running",
      strategy,
      metadata,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Failed to create X ingest run");
  }

  return data.id as string;
}

export async function finishIngestRun(
  supabase: SupabaseClient,
  runId: string,
  status: "succeeded" | "failed",
  counters: IngestCounters,
  error?: unknown,
) {
  const { error: updateError } = await supabase
    .from("x_ingest_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      accounts_seen: counters.accountsSeen,
      posts_seen: counters.postsSeen,
      posts_written: counters.postsWritten,
      candidates_created: counters.candidatesCreated,
      error_message: error ? formatError(error) : null,
    })
    .eq("id", runId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}
