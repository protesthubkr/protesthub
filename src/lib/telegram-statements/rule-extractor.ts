import {
  findSentenceInSource,
  normalizeConfidence,
  type ExtractTelegramStatementSentenceInput,
  type TelegramStatementSentenceExtractionResult,
} from "./extractor";
import { collectRuleCandidates } from "./rule-candidates";
import { extractLeadHeadlineByRule } from "./rule-headline";
import {
  RULE_MARGIN,
  RULE_MODEL,
  RULE_PROMPT_VERSION,
  RULE_THRESHOLD,
} from "./rule-patterns";
import { extractOpeningSentenceByRule } from "./rule-opening";

export function extractTelegramStatementSentenceByRule(
  input: ExtractTelegramStatementSentenceInput,
): TelegramStatementSentenceExtractionResult | null {
  const headline = extractLeadHeadlineByRule(input);

  if (headline) {
    return headline;
  }

  const openingSentence = extractOpeningSentenceByRule(input);

  if (openingSentence) {
    return openingSentence;
  }

  const candidates = collectRuleCandidates(input).sort(
    (first, second) => second.score - first.score,
  );
  const [best, second] = candidates;

  if (!best || best.score < RULE_THRESHOLD) {
    return null;
  }

  if (second && best.score - second.score < RULE_MARGIN) {
    return null;
  }

  const match = findSentenceInSource(input.textSnapshot, best.sentence);

  if (!match) {
    return null;
  }

  return {
    confidence: normalizeConfidence(best.score),
    coreSentence: match.sentence,
    coreSentenceEnd: match.end,
    coreSentenceStart: match.start,
    documentType: input.documentTypeHint,
    isTargetDocument: true,
    model: RULE_MODEL,
    promptVersion: RULE_PROMPT_VERSION,
    reason: `rule:${best.reasons.join(",")}`,
  };
}
