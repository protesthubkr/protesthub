import type { TelegramStatementDocumentType } from "@/lib/telegram-statements/types";

export type StatementQualitySourceType = "party" | "telegram";

export type StatementSentenceQualityInput = {
  confidence?: number | null;
  coreSentence: string | null;
  documentType?: string | null;
  sourceType?: StatementQualitySourceType;
};

export type StatementSentenceQualityDecision = {
  publishable: boolean;
  reason: string;
};

const MIN_LLM_CONFIDENCE = 65;

const URL_RE =
  /(https?:\/\/|www\.|t\.me\/|bit\.ly\/|forms\.gle|docs\.google\.com|[a-z0-9-]+\.(?:kr|org|com|net)\/)/i;
const HASHTAG_ONLY_RE = /^#[^\s#]+(?:\s+#[^\s#]+)*$/;
const INTERNAL_INSTRUCTION_RE =
  /^\s*\d+\.\s*.*(해\s*주십시오|해주십시오|병행|배포|공유|전달)/;
const NOTICE_SENTENCE_RE =
  /(기자회견|토론회|간담회|집회|행사|현장\s*스케치|영상|보도자료|자료|링크|URL|교육담당자|교육참가자|수련회|강좌|세미나|소식지|카드뉴스).{0,50}(개최합니다|공개합니다|안내합니다|소개합니다|배포합니다|참여|신청|보기|전달|모집|환영합니다)/i;
const NOTICE_LEAD_RE =
  /^(일시|시간|장소|문의|참가|참여|신청|주최|주관|후원|프로그램|발언|사회|자료|링크|보도자료)\s*[:：]/;
const BUNDLED_LEAD_BLOCK_RE =
  /(?:\[\d{6}_|\r?\n\s*■|ㅣ\s*[가-힣]{2,5}\s*(?:수석대변인|부대변인|대변인).*\r?\n)/;
const PERSON_TITLE_RE =
  /[가-힣]{2,5}\s*(대표|위원장|부위원장|대변인|부대변인|수석대변인|원내대표|정책조직실장|실장|국장|본부장)\s*$/;
const SENTENCE_ENDING_RE =
  /(다|요|까|라|십시오|입니다|합니다|드립니다|했다|겠다|겠습니다)[.!?。]?$/;
const DIRECT_STANCE_RE =
  /(규탄한다|규탄합니다|강력히\s*규탄|촉구한다|촉구합니다|요구한다|요구합니다|반대한다|반대합니다|비판한다|비판합니다|환영한다|환영합니다|우려한다|우려합니다|경고한다|경고합니다|고발한다|고발합니다|제안한다|제안합니다|선언한다|선언합니다|밝힌다|밝힙니다|다짐한다|다짐합니다|철회하라|중단하라|사퇴하라|해체하라|처벌하라|보장하라|사과하라|착수하라|마십시오|엄단해|싸우겠(?:다|습니다)|맞서\s*.*싸우|이어가겠습니다|함께하겠습니다|기억하겠습니다|기억하며|명복을\s*빕니다|책임져라|책임져야\s*한다|해야\s*한다|해야\s*합니다|만이\s*답입니다|것을\s*요구|것을\s*촉구|것임을\s*밝힌다)/;
const STANCE_NOUN_RE =
  /(규탄|촉구|요구|반대|환영|우려|비판|책임|개혁|보장|처벌|재선거|참사|사기극|무능|본색|침해|약탈|차별)/;

const NOTICE_DOCUMENT_TYPES = new Set<TelegramStatementDocumentType>([
  "press_conference",
  "press_release",
]);

export function getStatementSentenceQualityDecision(
  input: StatementSentenceQualityInput,
): StatementSentenceQualityDecision {
  const rawSentence = input.coreSentence ?? "";
  const sentence = normalizeSentence(input.coreSentence);

  if (!sentence) {
    return reject("empty_sentence");
  }

  if (BUNDLED_LEAD_BLOCK_RE.test(rawSentence)) {
    return reject("bundled_lead_block");
  }

  if (sentence.length < 10) {
    return reject("too_short");
  }

  if (sentence.length > 260) {
    return reject("too_long");
  }

  if (URL_RE.test(sentence)) {
    return reject("url_or_link");
  }

  if (HASHTAG_ONLY_RE.test(sentence)) {
    return reject("hashtag_only");
  }

  if (INTERNAL_INSTRUCTION_RE.test(sentence)) {
    return reject("internal_instruction");
  }

  if (NOTICE_LEAD_RE.test(sentence) || NOTICE_SENTENCE_RE.test(sentence)) {
    return reject("notice_sentence");
  }

  if (looksLikePersonTitleOnly(sentence)) {
    return reject("person_title_only");
  }

  const confidence = input.confidence ?? null;
  const hasDirectStance =
    DIRECT_STANCE_RE.test(sentence) || STANCE_NOUN_RE.test(sentence);

  if (
    NOTICE_DOCUMENT_TYPES.has(normalizeDocumentType(input.documentType)) &&
    !hasDirectStance
  ) {
    return reject("notice_document_without_stance");
  }

  if (confidence !== null && confidence < MIN_LLM_CONFIDENCE && !hasDirectStance) {
    return reject("low_confidence_without_stance");
  }

  if (!hasDirectStance && !SENTENCE_ENDING_RE.test(sentence)) {
    return reject("not_a_sentence");
  }

  return {
    publishable: true,
    reason: hasDirectStance ? "direct_stance" : "quality_pass",
  };
}

export function isStatementSentencePublishable(
  input: StatementSentenceQualityInput,
) {
  return getStatementSentenceQualityDecision(input).publishable;
}

export function hasDirectStatementStance(text: string) {
  return DIRECT_STANCE_RE.test(normalizeSentence(text));
}

function reject(reason: string): StatementSentenceQualityDecision {
  return {
    publishable: false,
    reason,
  };
}

function normalizeSentence(value: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeDocumentType(
  value: string | null | undefined,
): TelegramStatementDocumentType {
  if (
    value === "statement" ||
    value === "commentary" ||
    value === "position" ||
    value === "press_release" ||
    value === "press_conference" ||
    value === "condemnation" ||
    value === "welcome"
  ) {
    return value;
  }

  return "position";
}

function looksLikePersonTitleOnly(sentence: string) {
  return PERSON_TITLE_RE.test(sentence) && !SENTENCE_ENDING_RE.test(sentence);
}
