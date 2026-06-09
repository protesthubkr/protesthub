import { decodeHtmlEntities, normalizeText } from "../html";

export function buildDocumentText(title: string, body: string) {
  return normalizeText(
    [decodeHtmlEntities(title).trim(), body.trim()].filter(Boolean).join("\n\n"),
  );
}
