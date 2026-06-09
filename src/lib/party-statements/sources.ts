import { PEOPLE_POWER_PARTY_SOURCE } from "./sources/people-power";
import { REFORM_PARTY_SOURCE } from "./sources/reform-party";
import { THEMINJOO_SOURCE } from "./sources/theminjoo";
import type {
  PartyStatementSourceKey,
  PartyStatementSourceParser,
} from "./types";

export const PARTY_STATEMENT_SOURCES: PartyStatementSourceParser[] = [
  PEOPLE_POWER_PARTY_SOURCE,
  THEMINJOO_SOURCE,
  REFORM_PARTY_SOURCE,
];

export function getPartyStatementSources(sourceKey?: PartyStatementSourceKey) {
  if (!sourceKey) {
    return PARTY_STATEMENT_SOURCES;
  }

  return PARTY_STATEMENT_SOURCES.filter(
    (source) => source.sourceKey === sourceKey,
  );
}
