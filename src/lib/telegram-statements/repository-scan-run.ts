import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function createTelegramStatementScanRun({
  dryRun,
  supabase,
}: {
  dryRun: boolean;
  supabase: SupabaseClient;
}) {
  if (dryRun) {
    return null;
  }

  const { data, error } = await supabase
    .from("telegram_statement_scan_runs")
    .insert({
      metadata: {
        source: "telegram_statement_feed",
      },
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Failed to create statement scan run.");
  }

  return data.id as string;
}

export async function finishTelegramStatementScanRun({
  errorMessage,
  runId,
  status,
  supabase,
  totals,
}: {
  errorMessage?: string;
  runId: string | null;
  status: "succeeded" | "failed";
  supabase: SupabaseClient;
  totals: {
    candidatesCreated: number;
    channelsSeen: number;
    messagesSeen: number;
    messagesWritten: number;
  };
}) {
  if (!runId) {
    return;
  }

  const { error } = await supabase
    .from("telegram_statement_scan_runs")
    .update({
      candidates_created: totals.candidatesCreated,
      channels_seen: totals.channelsSeen,
      error_message: errorMessage ?? null,
      finished_at: new Date().toISOString(),
      messages_seen: totals.messagesSeen,
      messages_written: totals.messagesWritten,
      status,
    })
    .eq("id", runId);

  if (error) {
    throw new Error(error.message);
  }
}
