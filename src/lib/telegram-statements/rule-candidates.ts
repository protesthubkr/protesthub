import type { ExtractTelegramStatementSentenceInput } from "./extractor";
import { scoreCandidate } from "./rule-scoring";
import {
  getLabelStrippedSpans,
  splitLineIntoSentences,
  stripCandidatePrefix,
} from "./rule-text";
import type { RuleCandidate } from "./rule-types";

export function collectRuleCandidates(
  input: ExtractTelegramStatementSentenceInput,
) {
  const candidates: RuleCandidate[] = [];
  const seen = new Set<string>();
  const lineRe = /[^\r\n]+/g;
  let lineMatch: RegExpExecArray | null;

  addLeadBlockCandidate({ candidates, input, seen });

  while ((lineMatch = lineRe.exec(input.textSnapshot)) !== null) {
    const rawLine = lineMatch[0];
    const lineStart = lineMatch.index;
    const trimmedLine = rawLine.trim();

    if (!trimmedLine) {
      continue;
    }

    const leadingWhitespaceLength = rawLine.search(/\S/);
    const trimmedStart =
      lineStart + (leadingWhitespaceLength >= 0 ? leadingWhitespaceLength : 0);

    addCandidate({
      candidates,
      input,
      seen,
      sourceStart: trimmedStart,
      text: trimmedLine,
    });

    for (const span of getLabelStrippedSpans(trimmedLine, trimmedStart)) {
      addCandidate({
        candidates,
        input,
        seen,
        sourceStart: span.start,
        text: span.text,
      });
    }

    for (const sentence of splitLineIntoSentences(trimmedLine, trimmedStart)) {
      addCandidate({
        candidates,
        input,
        seen,
        sourceStart: sentence.start,
        text: sentence.text,
      });
    }
  }

  return candidates;
}

function addLeadBlockCandidate({
  candidates,
  input,
  seen,
}: {
  candidates: RuleCandidate[];
  input: ExtractTelegramStatementSentenceInput;
  seen: Set<string>;
}) {
  const leadMatch = input.textSnapshot.match(/^\s*((?:[^\r\n]+\S(?:\r?\n|$)){1,4})/);
  const leadBlock = leadMatch?.[1]?.trim();

  if (!leadBlock) {
    return;
  }

  const text = leadBlock.replace(/\s*\r?\n\s*/g, " ").trim();

  if (text.length > 280) {
    return;
  }

  addCandidate({
    candidates,
    input,
    seen,
    sourceStart: input.textSnapshot.indexOf(leadBlock),
    text,
  });
}

function addCandidate({
  candidates,
  input,
  seen,
  sourceStart,
  text,
}: {
  candidates: RuleCandidate[];
  input: ExtractTelegramStatementSentenceInput;
  seen: Set<string>;
  sourceStart: number;
  text: string;
}) {
  const stripped = stripCandidatePrefix(text, sourceStart);
  const normalized = stripped.text.trim();

  if (!normalized || seen.has(normalized)) {
    return;
  }

  const score = scoreCandidate({
    documentTypeHint: input.documentTypeHint,
    sentence: normalized,
    start: stripped.start,
  });

  if (!score) {
    return;
  }

  seen.add(normalized);
  candidates.push({
    end: stripped.start + normalized.length,
    reasons: score.reasons,
    score: score.value,
    sentence: normalized,
    start: stripped.start,
  });
}
