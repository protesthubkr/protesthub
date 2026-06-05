import "server-only";

export function isAdminSecretValid(secret: string | null | undefined) {
  const expectedSecret = process.env.INGEST_SECRET;
  return Boolean(expectedSecret && secret === expectedSecret);
}

export function getStringParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
