import "server-only";

import { timingSafeEqual } from "crypto";

export function isBearerSecretAuthorized(
  authorization: string | null,
  expectedSecret: string | undefined,
) {
  if (!expectedSecret && process.env.NODE_ENV !== "production") {
    return true;
  }

  if (!expectedSecret || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  return areSecretsEqual(authorization.slice("Bearer ".length), expectedSecret);
}

function areSecretsEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
