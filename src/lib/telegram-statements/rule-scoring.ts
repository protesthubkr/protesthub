import {
  DIRECT_STANCE_RE,
  LEAD_WINDOW_CHARS,
  MEDIUM_STANCE_RE,
  NOTICE_RE,
  STANCE_NOUN_RE,
  TARGET_DOCUMENT_TYPE_HINTS,
  TOPIC_CONTEXT_RE,
  URL_RE,
} from "./rule-patterns";
import { countSentenceEndings, isUsableCandidate } from "./rule-text";

export function scoreCandidate({
  documentTypeHint,
  sentence,
  start,
}: {
  documentTypeHint: string;
  sentence: string;
  start: number;
}) {
  if (!isUsableCandidate(sentence)) {
    return null;
  }

  const isLead = start <= LEAD_WINDOW_CHARS;
  const hasDirectStance = DIRECT_STANCE_RE.test(sentence);
  const hasStanceNoun = isLead && STANCE_NOUN_RE.test(sentence);
  const hasMediumStance = MEDIUM_STANCE_RE.test(sentence);
  const hasTopicContext = TOPIC_CONTEXT_RE.test(sentence);
  const canUseLeadFrame =
    isLead &&
    hasTopicContext &&
    TARGET_DOCUMENT_TYPE_HINTS.has(documentTypeHint);

  if (
    !hasDirectStance &&
    !hasStanceNoun &&
    !hasMediumStance &&
    !canUseLeadFrame
  ) {
    return null;
  }

  const reasons: string[] = [];
  let score = 0;

  if (hasDirectStance) {
    score += 42;
    reasons.push("direct_stance");
  }

  if (hasStanceNoun) {
    score += 30;
    reasons.push("stance_noun");
  }

  if (hasMediumStance) {
    score += 26;
    reasons.push("medium_stance");
  }

  if (hasTopicContext) {
    score += 24;
    reasons.push("topic_context");
  }

  if (canUseLeadFrame && !hasDirectStance && !hasStanceNoun) {
    score += 18;
    reasons.push("lead_topic_frame");
  }

  if (isLead) {
    score += 22;
    reasons.push("lead_context");
  } else if (start <= 1600) {
    score += 8;
    reasons.push("early_context");
  }

  if (sentence.length >= 18 && sentence.length <= 170) {
    score += 14;
    reasons.push("focused_length");
  } else if (sentence.length <= 240) {
    score += 6;
    reasons.push("acceptable_length");
  } else {
    score -= 18;
  }

  if (NOTICE_RE.test(sentence)) {
    score -= hasDirectStance ? 12 : 35;
  }

  if (URL_RE.test(sentence)) {
    score -= 45;
  }

  if (countSentenceEndings(sentence) > 1) {
    score -= 24;
    reasons.push("multi_sentence_penalty");
  }

  return {
    reasons,
    value: score,
  };
}
