import type { TopicCluster, TopicLexicalSource } from "./types";

const SINGLE_TOKEN_SUPPORT_THRESHOLD = 0.47;

const GENERIC_TOPIC_TOKENS = new Set([
  "개혁신당",
  "공동",
  "국민",
  "국민의힘",
  "권리",
  "기자회견",
  "논평",
  "노동자",
  "대변인",
  "대통령",
  "더불어민주당",
  "민주당",
  "민주노총",
  "반대",
  "보도자료",
  "보장",
  "부대변인",
  "비판",
  "사건",
  "사태",
  "성명",
  "수석대변인",
  "시민",
  "요구",
  "위원장",
  "위원회",
  "정부",
  "정당",
  "정책",
  "정치",
  "제안",
  "책임",
  "촉구",
  "후보",
]);

const TOPIC_ALIAS_GROUPS = [
  {
    aliases: [
      "부실선거",
      "부정선거",
      "선거소청",
      "선관위",
      "재선거",
      "참정권",
      "출구조사",
      "투표소",
      "투표용지",
    ],
    token: "topic:선거관리",
  },
  {
    aliases: ["순국선열", "현충일", "호국영령", "호국영웅", "보훈"],
    token: "topic:보훈",
  },
  {
    aliases: ["도급노동자", "도급제", "최저임금", "특수고용", "플랫폼노동자"],
    token: "topic:최저임금",
  },
  {
    aliases: ["공소취소", "특검", "법치"],
    token: "topic:공소취소",
  },
  {
    aliases: ["부동산", "집값", "증세"],
    token: "topic:경제정책",
  },
  {
    aliases: ["원청교섭", "노정교섭", "공공정책", "공항공사"],
    token: "topic:노정교섭",
  },
  {
    aliases: ["홈플러스", "MBK", "폐점"],
    token: "topic:홈플러스",
  },
  {
    aliases: ["오세훈", "서울시장", "탈시설", "장애인권리"],
    token: "topic:장애인권리",
  },
  {
    aliases: ["에어부산", "심리안정실", "장애인차별행위"],
    token: "topic:에어부산장애인차별",
  },
  {
    aliases: ["매불쇼", "최욱", "정준희"],
    token: "topic:매불쇼",
  },
  {
    aliases: ["대북송금", "오영훈", "제주지사"],
    token: "topic:대북송금",
  },
  {
    aliases: ["한성숙", "국무총리", "여성리더십"],
    token: "topic:국무총리후보자",
  },
];

export function hasTopicLexicalSupport(
  first: TopicLexicalSource,
  second: TopicLexicalSource,
  similarity: number,
) {
  const sharedCount = countSharedTopicTokens(first, second);

  return (
    sharedCount >= 2 ||
    (sharedCount >= 1 && similarity >= SINGLE_TOKEN_SUPPORT_THRESHOLD)
  );
}

export function hasTopicLexicalSupportWithCluster(
  source: TopicLexicalSource,
  cluster: Pick<TopicCluster, "members">,
  similarity: number,
) {
  return cluster.members.some((member) =>
    hasTopicLexicalSupport(source, member, similarity),
  );
}

function countSharedTopicTokens(
  first: TopicLexicalSource,
  second: TopicLexicalSource,
) {
  const firstTokens = getTopicTokens(first);
  const secondTokens = getTopicTokens(second);
  let sharedCount = 0;

  for (const token of firstTokens) {
    if (secondTokens.has(token)) {
      sharedCount += 1;
    }
  }

  return sharedCount;
}

function getTopicTokens(source: TopicLexicalSource) {
  const text = [source.title, source.core_sentence]
    .filter((value) => value?.trim())
    .join(" ");
  const tokens = new Set<string>();

  for (const group of TOPIC_ALIAS_GROUPS) {
    if (group.aliases.some((alias) => text.includes(alias))) {
      tokens.add(group.token);
    }
  }

  for (const rawToken of text.match(/[가-힣A-Za-z0-9]+/g) ?? []) {
    const token = normalizeTopicToken(rawToken);

    if (token.length >= 2 && !GENERIC_TOPIC_TOKENS.has(token)) {
      tokens.add(token);
    }
  }

  return tokens;
}

function normalizeTopicToken(value: string) {
  return value
    .toLowerCase()
    .replace(
      /(에게서|에게|으로부터|으로서|으로써|에서|부터|까지|처럼|보다|으로|로서|로써|에게|에는|에서|은|는|이|가|을|를|의|와|과|도|만)$/,
      "",
    )
    .trim();
}
