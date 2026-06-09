import {
  BULLET_PREFIX_RE,
  CONTEXT_LABEL_RE,
  DOCUMENT_LABEL_RE,
  HASHTAG_ONLY_RE,
  URL_RE,
} from "./rule-patterns";

export function stripCandidatePrefix(text: string, start: number) {
  const bulletMatch = text.match(BULLET_PREFIX_RE);
  const bulletLength = bulletMatch?.[0].length ?? 0;
  const withoutBullet = text.slice(bulletLength);
  const labelMatch = withoutBullet.match(DOCUMENT_LABEL_RE);
  const labelLength = labelMatch?.[0].length ?? 0;
  const withoutDocumentLabel = withoutBullet.slice(labelLength);
  const contextMatch = withoutDocumentLabel.match(CONTEXT_LABEL_RE);
  const contextLength = contextMatch?.[0].length ?? 0;
  const stripped = withoutDocumentLabel.slice(contextLength);
  const leadingWhitespaceLength = stripped.search(/\S/);
  const extraWhitespace =
    leadingWhitespaceLength >= 0 ? leadingWhitespaceLength : 0;

  return {
    start: start + bulletLength + labelLength + contextLength + extraWhitespace,
    text: stripped.trim(),
  };
}

export function getLabelStrippedSpans(text: string, start: number) {
  const stripped = stripCandidatePrefix(text, start);

  if (stripped.text === text.trim()) {
    return [];
  }

  return [stripped];
}

export function splitLineIntoSentences(text: string, start: number) {
  const spans: Array<{ start: number; text: string }> = [];
  const sentenceRe = /[^.!?。！？]+[.!?。！？]?/g;
  let sentenceMatch: RegExpExecArray | null;

  while ((sentenceMatch = sentenceRe.exec(text)) !== null) {
    const rawSentence = sentenceMatch[0];
    const leadingWhitespaceLength = rawSentence.search(/\S/);

    if (leadingWhitespaceLength < 0) {
      continue;
    }

    spans.push({
      start: start + sentenceMatch.index + leadingWhitespaceLength,
      text: rawSentence.trim(),
    });
  }

  return spans;
}

export function isUsableCandidate(sentence: string) {
  if (sentence.length < 10 || sentence.length > 300) {
    return false;
  }

  if (countSentenceEndings(sentence) > 1) {
    return false;
  }

  if (URL_RE.test(sentence) && sentence.length < 100) {
    return false;
  }

  if (HASHTAG_ONLY_RE.test(sentence)) {
    return false;
  }

  return true;
}

export function countSentenceEndings(sentence: string) {
  return (sentence.match(/[.!?。！？]/g) ?? []).length;
}

export function stripCandidateSuffix(text: string) {
  const inlineBylineMatch = text.match(
    /\s*[|ㅣ]\s*[가-힣]{2,5}\s*(?:수석대변인|부대변인|대변인|원내수석대변인|원내대변인)/,
  );
  let stripped = text;

  if (inlineBylineMatch?.index !== undefined) {
    stripped = stripped.slice(0, inlineBylineMatch.index).trim();
  }

  stripped = stripped
    .replace(/\s*\[\d{6}_[^\]]+\].*$/u, "")
    .replace(/\s*\[[^\]]*(?:논평|브리핑)\]\s*$/u, "")
    .replace(/\s+[“"].*$/u, "")
    .trim();

  return {
    text: stripped,
  };
}

export function looksLikeTruncatedContinuation(text: string) {
  return /(?:과|와|및|,|·)$/.test(text.trim());
}
