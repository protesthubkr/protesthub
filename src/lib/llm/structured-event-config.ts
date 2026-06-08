const DEFAULT_EXTRACTION_MODEL = "gpt-5-nano";
const DEFAULT_EXTRACTION_FALLBACK_MODEL = "gpt-5-mini";
const DEFAULT_EXTRACTION_MAX_OUTPUT_TOKENS = 6000;
const DEFAULT_EXTRACTION_REASONING_EFFORT = "minimal";
const REASONING_EFFORTS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

export function getExtractionModel() {
  return process.env.OPENAI_EXTRACTION_MODEL?.trim() || DEFAULT_EXTRACTION_MODEL;
}

export function getExtractionFallbackModel(primaryModel: string) {
  const rawValue = process.env.OPENAI_EXTRACTION_FALLBACK_MODEL;
  const fallbackModel =
    rawValue === undefined
      ? DEFAULT_EXTRACTION_FALLBACK_MODEL
      : rawValue.trim();

  if (!fallbackModel || fallbackModel === primaryModel) {
    return null;
  }

  return fallbackModel;
}

export function getExtractionMaxOutputTokens() {
  const value = process.env.OPENAI_EXTRACTION_MAX_OUTPUT_TOKENS;

  if (!value) {
    return DEFAULT_EXTRACTION_MAX_OUTPUT_TOKENS;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_EXTRACTION_MAX_OUTPUT_TOKENS;
  }

  return Math.min(Math.max(parsed, 2000), 30000);
}

export function getReasoningRequestOptions(model: string) {
  if (!isReasoningModel(model)) {
    return {};
  }

  const configuredEffort = process.env.OPENAI_EXTRACTION_REASONING_EFFORT
    ?.trim()
    .toLowerCase();
  const effort = configuredEffort || DEFAULT_EXTRACTION_REASONING_EFFORT;

  if (!REASONING_EFFORTS.has(effort)) {
    return {
      reasoning: {
        effort: DEFAULT_EXTRACTION_REASONING_EFFORT,
      },
    };
  }

  if (effort === "none" && !model.startsWith("gpt-5.1")) {
    return {
      reasoning: {
        effort: DEFAULT_EXTRACTION_REASONING_EFFORT,
      },
    };
  }

  return {
    reasoning: {
      effort,
    },
  };
}

function isReasoningModel(model: string) {
  return model.startsWith("gpt-5") || /^o\d/.test(model);
}
