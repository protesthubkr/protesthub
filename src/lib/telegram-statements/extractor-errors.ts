export class TelegramStatementExtractionConfigError extends Error {
  constructor(message = "OPENAI_API_KEY is not configured.") {
    super(message);
  }
}

export class TelegramStatementExtractionRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`OpenAI statement extraction failed with status ${status}`);
  }
}

export class TelegramStatementSentenceNotFoundError extends Error {
  constructor(readonly coreSentence: string) {
    super("Extracted core sentence was not found in source text.");
  }
}
