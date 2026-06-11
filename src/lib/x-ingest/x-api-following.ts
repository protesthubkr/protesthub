import type {
  XFollowingAccountsFetchResult,
  XFollowingResponse,
  XUser,
} from "./types";
import { X_API_BASE_URL, USER_FIELDS } from "./x-api-fields";
import { fetchX } from "./x-api-client";

export async function fetchFollowingAccounts({
  bearerToken,
  operatingUserId,
  maxAccounts,
}: {
  bearerToken: string;
  operatingUserId: string;
  maxAccounts: number;
}): Promise<XFollowingAccountsFetchResult> {
  const accounts: XUser[] = [];
  let paginationToken: string | undefined;
  let fullyFetched = false;

  while (accounts.length < maxAccounts) {
    const url = new URL(
      `${X_API_BASE_URL}/users/${operatingUserId}/following`,
    );
    url.searchParams.set("max_results", "1000");
    url.searchParams.set("user.fields", USER_FIELDS);

    if (paginationToken) {
      url.searchParams.set("pagination_token", paginationToken);
    }

    const page = await fetchX<XFollowingResponse>(url, bearerToken);
    accounts.push(...(page.data ?? []));

    if (!page.meta?.next_token) {
      fullyFetched = true;
      break;
    }

    paginationToken = page.meta.next_token;
  }

  return {
    accounts: accounts.slice(0, maxAccounts),
    fullyFetched,
    truncatedByLimit: !fullyFetched,
  };
}
