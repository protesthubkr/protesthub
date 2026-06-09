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

const REFORM_PARTY_LIST_URL = "https://www.reformparty.kr/briefing";

export const REFORM_PARTY_SOURCE: PartyStatementSourceParser = {
  listUrl: REFORM_PARTY_LIST_URL,
  organizationName: "개혁신당",
  parseDetail: parseReformPartyDetail,
  parseList: parseReformPartyList,
  sourceKey: "reform_party",
};

function parseReformPartyList(html: string) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/g) ?? [];

  return rows.flatMap((row) => {
    const rawCategory = stripHtml(
      extractFirstMatch(row, /<a[^>]*class=["']bo_cate["'][^>]*>([\s\S]*?)<\/a>/i),
    );
    const documentType = mapPartyDocumentType(rawCategory);

    if (!documentType) {
      return [];
    }

    const href = extractFirstMatch(
      row,
      /<a\s+href=["']([^"']*\/briefing\/\d+[^"']*)["'][^>]*>/i,
    );
    const title = stripHtml(
      extractFirstMatch(row, /<div[^>]*class=["']bo_tit["'][^>]*>[\s\S]*?<a\s+href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/i),
    );
    const date = stripHtml(
      extractFirstMatch(row, /<td[^>]*class=["']td_datetime["'][^>]*>([\s\S]*?)<\/td>/i),
    );
    const externalId = href.match(/\/briefing\/(\d+)/)?.[1];

    if (!href || !title || !externalId) {
      return [];
    }

    return [
      {
        documentType,
        externalId,
        publishedAt: parseKoreanDateTime(date),
        rawCategory,
        sourceKey: "reform_party",
        sourceUrl: absoluteUrl(href, REFORM_PARTY_LIST_URL),
        title,
      } satisfies PartyStatementListItem,
    ];
  });
}

function parseReformPartyDetail(
  html: string,
  listItem: PartyStatementListItem,
) {
  const title =
    stripHtml(
      extractFirstMatch(
        html,
        /<span[^>]*class=["']bo_v_tit["'][^>]*>([\s\S]*?)<\/span>/i,
      ),
    ) || listItem.title;
  const date = stripHtml(
    extractFirstMatch(
      html,
      /<span[^>]*class=["']content if_date["'][^>]*>([\s\S]*?)<\/span>/i,
    ),
  );
  const bodyHtml = extractFirstMatch(
    html,
    /<div[^>]*id=["']bo_v_con["'][^>]*>([\s\S]*?)<\/div>/i,
  );
  const textSnapshot = stripHtml(bodyHtml);

  if (!textSnapshot) {
    return null;
  }

  return {
    ...listItem,
    organizationName: "개혁신당",
    publishedAt: parseKoreanDateTime(date) ?? listItem.publishedAt,
    textSnapshot: buildDocumentText(title, textSnapshot),
    title,
  } satisfies PartyStatementDocument;
}
