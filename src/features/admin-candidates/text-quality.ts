import type { ReviewCandidate } from "@/lib/admin-candidates";

export function hasMeaningfulPostText(candidate: ReviewCandidate) {
  return isMeaningfulExtractionText(candidate.textSnapshot);
}

export function hasMeaningfulExtractionText(candidate: ReviewCandidate) {
  return isMeaningfulExtractionText(
    [candidate.textSnapshot, candidate.ocrText].join("\n"),
  );
}

function isMeaningfulExtractionText(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim().length > 12;
}
