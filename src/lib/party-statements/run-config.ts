const DEFAULT_PARTY_STATEMENT_LIMIT = 20;

export function getPartyStatementRunLimit(optionValue: number | undefined) {
  return optionValue ?? DEFAULT_PARTY_STATEMENT_LIMIT;
}

export function getPartyStatementCutoffIso(windowHours: number | undefined) {
  return windowHours
    ? new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
    : null;
}
