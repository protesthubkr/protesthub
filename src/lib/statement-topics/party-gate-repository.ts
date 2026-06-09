import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { roundSimilarity } from "./repository-utils";

export async function markPartyStatementTopicMatched({
  confidence,
  summaryId,
  supabase,
  topicId,
}: {
  confidence: number;
  summaryId: string;
  supabase: SupabaseClient;
  topicId: string;
}) {
  const { error } = await supabase
    .from("party_statement_summaries")
    .update({
      matched_topic_id: topicId,
      topic_gate_status: "matched",
      topic_match_confidence: roundSimilarity(confidence),
      topic_match_method: "embedding",
      topic_matched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", summaryId)
    .not("topic_gate_status", "eq", "manual_hidden");

  if (error) {
    throw new Error(error.message);
  }
}

export async function markPartyStatementTopicUnmatched({
  summaryId,
  supabase,
}: {
  summaryId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("party_statement_summaries")
    .update({
      matched_topic_id: null,
      topic_gate_status: "unmatched",
      topic_match_confidence: null,
      topic_match_method: "embedding",
      topic_matched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", summaryId)
    .not("topic_gate_status", "eq", "manual_matched")
    .not("topic_gate_status", "eq", "manual_hidden");

  if (error) {
    throw new Error(error.message);
  }
}
