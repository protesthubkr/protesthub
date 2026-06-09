export function findSentenceInSource(source: string, extractedSentence: string) {
  const exactStart = source.indexOf(extractedSentence);

  if (exactStart >= 0) {
    return {
      end: exactStart + extractedSentence.length,
      sentence: extractedSentence,
      start: exactStart,
    };
  }

  return findWhitespaceNormalizedSentence(source, extractedSentence);
}

export function normalizeConfidence(value: number) {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function findWhitespaceNormalizedSentence(
  source: string,
  extractedSentence: string,
) {
  const normalizedTarget = normalizeWhitespace(extractedSentence);

  if (!normalizedTarget) {
    return null;
  }

  for (let start = 0; start < source.length; start += 1) {
    if (isWhitespace(source[start])) {
      continue;
    }

    let targetIndex = 0;
    let sourceIndex = start;

    while (sourceIndex < source.length && targetIndex < normalizedTarget.length) {
      const sourceChar = source[sourceIndex];
      const targetChar = normalizedTarget[targetIndex];

      if (isWhitespace(sourceChar)) {
        if (targetChar !== " ") {
          sourceIndex += 1;
          continue;
        }

        while (sourceIndex < source.length && isWhitespace(source[sourceIndex])) {
          sourceIndex += 1;
        }

        targetIndex += 1;
        continue;
      }

      if (sourceChar !== targetChar) {
        break;
      }

      sourceIndex += 1;
      targetIndex += 1;
    }

    if (targetIndex === normalizedTarget.length) {
      return {
        end: sourceIndex,
        sentence: source.slice(start, sourceIndex).trim(),
        start,
      };
    }
  }

  return null;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isWhitespace(value: string | undefined) {
  return !value || /\s/.test(value);
}
