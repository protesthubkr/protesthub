import {
  findSentenceInSource,
  normalizeConfidence,
  type ExtractTelegramStatementSentenceInput,
  type TelegramStatementSentenceExtractionResult,
} from "./extractor";
import {
  DIRECT_STANCE_RE,
  MEDIUM_STANCE_RE,
  RULE_MODEL,
  RULE_PROMPT_VERSION,
  STANCE_NOUN_RE,
  TARGET_DOCUMENT_TYPE_HINTS,
  TOPIC_CONTEXT_RE,
  URL_RE,
} from "./rule-patterns";
import { isUsableCandidate, stripCandidatePrefix } from "./rule-text";

export function extractOpeningSentenceByRule(
  input: ExtractTelegramStatementSentenceInput,
): TelegramStatementSentenceExtractionResult | null {
  if (!TARGET_DOCUMENT_TYPE_HINTS.has(input.documentTypeHint)) {
    return null;
  }

  const openingMatch = input.textSnapshot.match(/\S[\s\S]{9,240}?[.!?]/);
  const openingSentence = openingMatch?.[0]?.trim();

  if (!openingSentence) {
    return null;
  }

  const stripped = stripCandidatePrefix(openingSentence, openingMatch?.index ?? 0);
  const sentence = stripped.text.replace(/\s+/g, " ").trim();

  if (!isUsableCandidate(sentence) || URL_RE.test(sentence)) {
    return null;
  }

  const hasDirectStance = DIRECT_STANCE_RE.test(sentence);
  const hasStanceNoun = STANCE_NOUN_RE.test(sentence);
  const hasMediumStance = MEDIUM_STANCE_RE.test(sentence);
  const hasTopicContext = TOPIC_CONTEXT_RE.test(sentence);

  if (
    !hasTopicContext ||
    (!hasDirectStance && !hasStanceNoun && !hasMediumStance)
  ) {
    return null;
  }

  const match = findSentenceInSource(input.textSnapshot, sentence);

  if (!match) {
    return null;
  }

  const reasons = ["opening_sentence", "topic_context"];

  if (hasDirectStance) {
    reasons.push("direct_stance");
  }

  if (hasStanceNoun) {
    reasons.push("stance_noun");
  }

  if (hasMediumStance) {
    reasons.push("medium_stance");
  }

  return {
    confidence: normalizeConfidence(98),
    coreSentence: match.sentence,
    coreSentenceEnd: match.end,
    coreSentenceStart: match.start,
    documentType: input.documentTypeHint,
    isTargetDocument: true,
    model: RULE_MODEL,
    promptVersion: RULE_PROMPT_VERSION,
    reason: `rule:${reasons.join(",")}`,
  };
}
