export function normalizeEmbedding(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) =>
    typeof item === "number" ? item : Number.parseFloat(String(item)),
  );
}

export function roundSimilarity(value: number) {
  return Number.parseFloat(value.toFixed(5));
}

export function isMissingTopicGateColumn(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "42703" ||
    /topic_gate_status|party_statement_summaries/i.test(error.message ?? "")
  );
}
