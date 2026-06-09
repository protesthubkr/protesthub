import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequiredSupabaseAdminClient } from "@/lib/telegram-statements/repository";

type StatusCounts = Record<string, number>;

export async function getStatementBackfillCounts({
  cutoffIso,
}: {
  cutoffIso: string;
}) {
  const supabase = getRequiredSupabaseAdminClient();
  const [telegramByStatus, partyByStatus, telegramVisible, partyVisible] =
    await Promise.all([
      getStatusCounts({
        cutoffColumn: "message_created_at",
        cutoffIso,
        supabase,
        table: "telegram_statement_summaries",
      }),
      getStatusCounts({
        cutoffColumn: "published_at",
        cutoffIso,
        supabase,
        table: "party_statement_summaries",
      }),
      getVisibleTelegramCount({ cutoffIso, supabase }),
      getVisiblePartyCount({ cutoffIso, supabase }),
    ]);

  return {
    partyByStatus,
    partyVisible,
    publicVisible: telegramVisible + partyVisible,
    telegramByStatus,
    telegramVisible,
  };
}

async function getStatusCounts({
  cutoffColumn,
  cutoffIso,
  supabase,
  table,
}: {
  cutoffColumn: string;
  cutoffIso: string;
  supabase: SupabaseClient;
  table: string;
}) {
  const { data, error } = await supabase
    .from(table)
    .select("status")
    .gte(cutoffColumn, cutoffIso)
    .limit(5000);

  if (error) {
    if (isMissingTable(error)) {
      return {};
    }

    throw new Error(error.message);
  }

  return ((data as Array<{ status?: string }> | null) ?? []).reduce<StatusCounts>(
    (counts, row) => {
      const status = row.status ?? "unknown";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    },
    {},
  );
}

async function getVisibleTelegramCount({
  cutoffIso,
  supabase,
}: {
  cutoffIso: string;
  supabase: SupabaseClient;
}) {
  const { count, error } = await supabase
    .from("telegram_statement_summaries")
    .select("id", { count: "exact", head: true })
    .eq("status", "extracted")
    .gte("message_created_at", cutoffIso);

  if (error) {
    if (isMissingTable(error)) {
      return 0;
    }

    throw new Error(error.message);
  }

  return count ?? 0;
}

async function getVisiblePartyCount({
  cutoffIso,
  supabase,
}: {
  cutoffIso: string;
  supabase: SupabaseClient;
}) {
  const { count, error } = await supabase
    .from("party_statement_summaries")
    .select("id", { count: "exact", head: true })
    .eq("status", "extracted")
    .in("topic_gate_status", ["matched", "manual_matched"])
    .gte("published_at", cutoffIso);

  if (error) {
    if (isMissingTable(error)) {
      return 0;
    }

    throw new Error(error.message);
  }

  return count ?? 0;
}

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || /does not exist/i.test(error.message ?? "");
}
