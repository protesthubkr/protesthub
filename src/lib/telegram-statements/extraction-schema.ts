export const TELEGRAM_STATEMENT_EXTRACTION_PROMPT_VERSION =
  "telegram_statement_sentence_v3";

export const TELEGRAM_STATEMENT_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_target_document",
    "document_type",
    "core_sentence",
    "confidence",
    "reason",
  ],
  properties: {
    is_target_document: {
      type: "boolean",
    },
    document_type: {
      type: "string",
      enum: [
        "statement",
        "commentary",
        "position",
        "press_release",
        "press_conference",
        "condemnation",
        "welcome",
      ],
    },
    core_sentence: {
      type: "string",
    },
    confidence: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },
    reason: {
      type: "string",
    },
  },
} as const;
