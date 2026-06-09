export const RULE_MODEL = "rule-v2";
export const RULE_PROMPT_VERSION = "telegram_statement_rule_v2";
export const RULE_THRESHOLD = 74;
export const RULE_MARGIN = 8;
export const LEAD_WINDOW_CHARS = 700;

export const TARGET_DOCUMENT_TYPE_HINTS = new Set([
  "statement",
  "commentary",
  "position",
  "condemnation",
  "welcome",
]);

export const DOCUMENT_LABEL_RE =
  /^[\s"'`([{<【\[]*((긴급\s*)?(성명서?|논평문?|입장문?|기자회견문|보도자료|보도문|규탄문|환영문|공동성명|공동입장|공동논평|브리핑|소식))[\s"'`)\]】}>:：|.-]*/;
export const CONTEXT_LABEL_RE = /^\s*\[[^\]]{2,50}\]\s*/;
export const BULLET_PREFIX_RE =
  /^[\s>*\-ㆍ·•○●■□◆◇▶▷✔✅🔥📍📰📝🔎]+/u;

export const DIRECT_STANCE_RE =
  /(규탄한다|규탄합니다|강력히\s*규탄|촉구한다|촉구합니다|요구한다|요구합니다|반대한다|반대합니다|비판한다|비판합니다|환영한다|환영합니다|우려한다|우려합니다|경고한다|경고합니다|고발한다|고발합니다|제안한다|제안합니다|선언한다|선언합니다|밝힌다|밝힙니다|다짐한다|다짐합니다|철회하라|중단하라|사퇴하라|해체하라|처벌하라|보장하라|사과하라|착수하라|엄단해|마십시오|책임져라|책임져야\s*한다|해야\s*한다|해야\s*합니다|싸우겠(?:다|습니다)|맞서\s*.*싸우|끝까지\s*지켜볼|이어가겠습니다|함께하겠습니다|기억하겠습니다|기억하며)/;
export const STANCE_NOUN_RE =
  /(규탄|촉구|요구|반대|환영|우려|비판|책임|개혁|보장|처벌|재선거|참사|사기극|무능|본색|침해|약탈|차별)/;
export const MEDIUM_STANCE_RE =
  /(필요하다|필요합니다|문제다|부당하다|심각하다|중대하다|중대한\s*사건|단면일\s*뿐이다|답입니다|할\s*것이다|해야\s*할\s*것|것을\s*요구|것을\s*촉구|입장을\s*밝힌다)/;
export const TOPIC_CONTEXT_RE =
  /(사태|사건|문제|정책|예산|선관위|투표용지|투표소|참정권|공항|공항공사|최저임금|원청교섭|노정교섭|공공기관|해고|장애|차별|의료|후보|정치개혁|민주주의|진상|책임자|제도\s*개선|권리|노동자|정부|교육감|공공정책|오세훈|서울시장|인천시장|지방선거|탈시설|보훈|현충일|호국|부동산|증세|공소취소|매불쇼|송파|대북송금|국무총리)/;
export const NOTICE_RE =
  /(일시|장소|시간|문의|참가|신청|주최|주관|후원|프로그램|발언|사회|자료|링크|영상|스케치|생중계|개최합니다|공개합니다)\s*[:：|]?/;
export const URL_RE = /https?:\/\/|t\.me\/|bit\.ly\/|forms\.gle\/|docs\.google\.com/i;
export const HASHTAG_ONLY_RE = /^#[^\s#]+(?:\s+#[^\s#]+)*$/;
