import {
  absoluteUrl,
  extractFirstMatch,
  mapPartyDocumentType,
  parseKoreanDateTime,
  stripHtml,
} from "../html";
import type {
  PartyStatementDocument,
  PartyStatementListItem,
  PartyStatementSourceParser,
} from "../types";
import { buildDocumentText } from "./source-utils";

const PEOPLE_POWER_LIST_URL = "https://www.peoplepowerparty.kr/news/comment";

export const PEOPLE_POWER_PARTY_SOURCE: PartyStatementSourceParser = {
  listUrl: PEOPLE_POWER_LIST_URL,
  organizationName: "국민의힘",
  parseDetail: parsePeoplePowerDetail,
  parseList: parsePeoplePowerList,
  sourceKey: "people_power_party",
};

function parsePeoplePowerList(html: string) {
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];

  return rows.flatMap((row) => {
    const rawCategory = stripHtml(
      extractFirstMatch(row, /<td[^>]*class=["']class["'][^>]*>([\s\S]*?)<\/td>/i),
    );
    const documentType = mapPartyDocumentType(rawCategory);

    if (!documentType) {
      return [];
    }

    const href = extractFirstMatch(row, /<a\s+href=["']([^"']+)["'][^>]*>/i);
    const title = stripHtml(extractFirstMatch(row, /<a\s+href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/i));
    const date = stripHtml(
      extractFirstMatch(row, /<td[^>]*class=["']date["'][^>]*>([\s\S]*?)<\/td>/i),
    );
    const externalId = href.match(/comment_view_all\/(\d+)/)?.[1];

    if (!href || !title || !externalId) {
      return [];
    }

    return [
      {
        documentType,
        externalId,
        publishedAt: parseKoreanDateTime(date),
        rawCategory,
        sourceKey: "people_power_party",
        sourceUrl: absoluteUrl(href, PEOPLE_POWER_LIST_URL),
        title,
      } satisfies PartyStatementListItem,
    ];
  });
}

function parsePeoplePowerDetail(
  html: string,
  listItem: PartyStatementListItem,
) {
  const title =
    stripHtml(
      extractFirstMatch(html, /<dt[^>]*class=["']sbj["'][^>]*>([\s\S]*?)<\/dt>/i),
    ) || listItem.title;
  const date = stripHtml(
    extractFirstMatch(html, /<dd[^>]*class=["']date["'][^>]*>[\s\S]*?<span>작성일<\/span>([\s\S]*?)<\/dd>/i),
  );
  const bodyHtml = extractFirstMatch(
    html,
    /<dd[^>]*class=["']conts["'][^>]*>([\s\S]*?)<\/dd>/i,
  );
  const textSnapshot = stripHtml(bodyHtml);

  if (!textSnapshot) {
    return null;
  }

  return {
    ...listItem,
    organizationName: "국민의힘",
    publishedAt: parseKoreanDateTime(date) ?? listItem.publishedAt,
    textSnapshot: buildDocumentText(title, textSnapshot),
    title,
  } satisfies PartyStatementDocument;
}
