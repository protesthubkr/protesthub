import {
  findSentenceInSource,
  normalizeConfidence,
  type ExtractTelegramStatementSentenceInput,
  type TelegramStatementSentenceExtractionResult,
} from "./extractor";
import {
  DIRECT_STANCE_RE,
  NOTICE_RE,
  RULE_MODEL,
  RULE_PROMPT_VERSION,
  STANCE_NOUN_RE,
  TOPIC_CONTEXT_RE,
  URL_RE,
} from "./rule-patterns";
import {
  countSentenceEndings,
  isUsableCandidate,
  looksLikeTruncatedContinuation,
  stripCandidatePrefix,
  stripCandidateSuffix,
} from "./rule-text";

export function extractLeadHeadlineByRule(
  input: ExtractTelegramStatementSentenceInput,
): TelegramStatementSentenceExtractionResult | null {
  const leadMatch = input.textSnapshot.match(/^\s*((?:[^\r\n]+\S(?:\r?\n|$)){1,4})/);
  const leadBlock = leadMatch?.[1]?.trim();

  if (!leadBlock) {
    return null;
  }

  for (const line of getLeadLineCandidates({
    leadBlock,
    leadStart: input.textSnapshot.indexOf(leadBlock),
  })) {
    const lineResult = buildLeadHeadlineResult({
      input,
      sourceStart: line.start,
      text: line.text,
    });

    if (lineResult) {
      return lineResult;
    }
  }

  const combinedHeadline = leadBlock.replace(/\s*\r?\n\s*/g, " ").trim();

  if (!shouldTryCombinedLeadHeadline(leadBlock, combinedHeadline)) {
    return null;
  }

  return buildLeadHeadlineResult({
    input,
    sourceStart: input.textSnapshot.indexOf(leadBlock),
    text: combinedHeadline,
  });
}

function buildLeadHeadlineResult({
  input,
  sourceStart,
  text,
}: {
  input: ExtractTelegramStatementSentenceInput;
  sourceStart: number;
  text: string;
}): TelegramStatementSentenceExtractionResult | null {
  const stripped = stripCandidatePrefix(text, sourceStart);
  const normalized = stripCandidateSuffix(stripped.text.trim());
  const headline = normalized.text;

  if (looksLikeTruncatedContinuation(headline)) {
    return null;
  }

  if (!isUsableCandidate(headline) || URL_RE.test(headline)) {
    return null;
  }

  const hasDirectStance = DIRECT_STANCE_RE.test(headline);
  const hasStanceNoun = STANCE_NOUN_RE.test(headline);
  const hasTopicContext = TOPIC_CONTEXT_RE.test(headline);
  const isNoticeDocument =
    input.documentTypeHint === "press_conference" ||
    input.documentTypeHint === "press_release";

  if (
    isNoticeDocument &&
    (!hasStanceNoun || !hasTopicContext || NOTICE_RE.test(headline))
  ) {
    return null;
  }

  if (
    !hasDirectStance &&
    !hasStanceNoun &&
    !(
      hasTopicContext &&
      ["statement", "commentary"].includes(input.documentTypeHint)
    )
  ) {
    return null;
  }

  const match = findSentenceInSource(input.textSnapshot, headline);

  if (!match) {
    return null;
  }

  const reasons = ["lead_headline"];

  if (hasDirectStance) {
    reasons.push("direct_stance");
  }

  if (hasStanceNoun) {
    reasons.push("stance_noun");
  }

  if (hasTopicContext) {
    reasons.push("topic_context");
  }

  return {
    confidence: normalizeConfidence(96),
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

function getLeadLineCandidates({
  leadBlock,
  leadStart,
}: {
  leadBlock: string;
  leadStart: number;
}) {
  const candidates: Array<{ start: number; text: string }> = [];
  const lineRe = /[^\r\n]+/g;
  let lineMatch: RegExpExecArray | null;

  while ((lineMatch = lineRe.exec(leadBlock)) !== null) {
    const rawLine = lineMatch[0];
    const leadingWhitespaceLength = rawLine.search(/\S/);

    if (leadingWhitespaceLength < 0) {
      continue;
    }

    candidates.push({
      start: leadStart + lineMatch.index + leadingWhitespaceLength,
      text: rawLine.trim(),
    });
  }

  return candidates;
}

function shouldTryCombinedLeadHeadline(leadBlock: string, headline: string) {
  if (!headline) {
    return false;
  }

  if (
    /[\r\n]/.test(leadBlock) &&
    /(?:\[\d{6}_|^\s*■|\r?\n\s*■|ㅣ\s*[가-힣]{2,5}\s*(?:수석대변인|부대변인|대변인))/m.test(
      leadBlock,
    )
  ) {
    return false;
  }

  return countSentenceEndings(headline) <= 1;
}
