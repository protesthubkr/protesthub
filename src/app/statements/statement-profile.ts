import type { PublicStatementFeedItem } from "@/lib/telegram-statements/public-feed";

type StatementProfile = {
  label: string;
  logoSrc: string | null;
};

const STATEMENT_PROFILES = [
  {
    label: "노동당",
    logoSrc: "/laborparty-logo.jpg",
    patterns: ["노동당", "laborkr"],
  },
  {
    label: "정의당",
    logoSrc: "/justice-logo.jpg",
    patterns: ["정의당", "justice"],
  },
  {
    label: "공공운수",
    logoSrc: "/gonggong-logo.png",
    patterns: ["공공운수", "gonggong"],
  },
  {
    label: "전장연",
    logoSrc: "/junjang-logo.png",
    patterns: ["전장연", "전국장애인차별철폐", "junjang"],
  },
  {
    label: "민주노총",
    logoSrc: "/laborunion-logo.jpg",
    patterns: ["민주노총", "전국민주노동조합총연맹", "kctu"],
  },
  {
    label: "민주당",
    logoSrc: "/minjoo-logo.svg",
    patterns: ["더불어민주당", "민주당", "theminjoo"],
  },
  {
    label: "국힘당",
    logoSrc: "/ppl-logo.svg",
    patterns: ["국민의힘", "국힘당", "peoplepowerparty"],
  },
  {
    label: "개혁신당",
    logoSrc: "/reform-logo.svg",
    patterns: ["개혁신당", "reformparty"],
  },
] satisfies Array<StatementProfile & { patterns: string[] }>;

const PARTY_STATEMENT_LOGO_SRCS = new Set([
  "/laborparty-logo.jpg",
  "/justice-logo.jpg",
  "/minjoo-logo.svg",
  "/ppl-logo.svg",
  "/reform-logo.svg",
]);

export function getStatementProfile(
  item: PublicStatementFeedItem,
): StatementProfile {
  const matchText = `${item.organizationName} ${item.sourceUrl}`.toLowerCase();

  return (
    STATEMENT_PROFILES.find((profile) =>
      profile.patterns.some((pattern) => matchText.includes(pattern)),
    ) ?? {
      label: item.organizationName.replace(/\s*채널$/, "").trim() || item.organizationName,
      logoSrc: null,
    }
  );
}

export function isPartyStatementProfile(profile: StatementProfile) {
  return Boolean(
    profile.logoSrc && PARTY_STATEMENT_LOGO_SRCS.has(profile.logoSrc),
  );
}

export function getAvatarLabel(name: string) {
  const compactName = Array.from(name.replace(/\s+/g, ""));
  return compactName[0]?.toUpperCase() ?? "?";
}

export function getAvatarTone(name: string) {
  let hash = 0;

  for (const character of Array.from(name)) {
    hash += character.codePointAt(0) ?? 0;
  }

  return hash % 6;
}
