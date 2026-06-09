import type { TelegramChannelMessage } from "@/lib/telegram/channel-page";
import type {
  TelegramStatementCandidate,
  TelegramStatementDocumentType,
} from "./types";
import { hasDirectStatementStance } from "@/lib/statement-quality/extraction-quality";

const DOCUMENT_PATTERNS: Array<{
  documentType: TelegramStatementDocumentType;
  pattern: RegExp;
  reason: string;
}> = [
  { documentType: "commentary", pattern: /논평|논평문/, reason: "keyword:commentary" },
  { documentType: "statement", pattern: /성명|성명서/, reason: "keyword:statement" },
  { documentType: "position", pattern: /입장문|공식\s*입장|입장을\s*밝힌다/, reason: "keyword:position" },
  { documentType: "press_conference", pattern: /기자회견문|회견문/, reason: "keyword:press_conference" },
  { documentType: "press_release", pattern: /보도자료/, reason: "keyword:press_release" },
  { documentType: "condemnation", pattern: /규탄문|규탄\s*성명/, reason: "keyword:condemnation" },
  { documentType: "welcome", pattern: /환영문|환영\s*논평|환영\s*성명/, reason: "keyword:welcome" },
];

const STANCE_PATTERN =
  /(규탄한다|촉구한다|요구한다|철회하라|중단하라|사퇴하라|반대한다|환영한다|비판한다|우려한다|연대한다)/;

const LEAD_STANCE_NEWS_RE =
  /^(<소식>|\[소식\]|.*브리핑\b).{0,220}(규탄|촉구|요구|철회|반대|비판|우려|책임|교섭|개혁|보장|처벌|착수|마십시오)/;

const DIGEST_RE = /민주노총\s*소식|📰.{0,80}📰|오피니언\s*📝/;

const EVENT_OR_PROGRAM_RE =
  /(교육영상|교안|교육담당자|교육참가자|수련회|참가자\s*모집|강좌|세미나|선전전|집담회|참가\s*신청|공동주최\s*신청|일시\s*[|:：]|장소\s*[|:：]|생중계|내일은\s*뭐하나요|특사단\s*\[\d+일차\])/;

const REPORTED_INTERVIEW_RE =
  /(후보는|대표는|위원장은|지부장은).{0,180}(말했다|밝혔다|토로했다|전했다|설명했다|성찰)/;

const WEAK_NOTICE_PATTERN =
  /(참가\s*신청|참가자\s*모집|신청\s*링크|후원\s*계좌|문의\s*:|장소\s*:|일시\s*:|시간\s*:)/;
const NOTICE_DOCUMENT_TYPES = new Set<TelegramStatementDocumentType>([
  "press_conference",
  "press_release",
]);

export function classifyTelegramStatementMessage(
  message: TelegramChannelMessage,
): TelegramStatementCandidate | null {
  const text = normalizeSourceText(message.text);

  if (!text) {
    return null;
  }

  const detected = DOCUMENT_PATTERNS.find(({ pattern }) => pattern.test(text));

  if (detected) {
    if (
      NOTICE_DOCUMENT_TYPES.has(detected.documentType) &&
      !hasDirectStatementStance(text)
    ) {
      return null;
    }

    return {
      detectionReason: [detected.reason],
      documentType: detected.documentType,
      message,
    };
  }

  const leadText = text.slice(0, 320);

  if (
    LEAD_STANCE_NEWS_RE.test(leadText) &&
    !looksLikeDigestOrProgram(leadText)
  ) {
    return {
      detectionReason: ["lead:stance_news"],
      documentType: "position",
      message,
    };
  }

  if (
    (STANCE_PATTERN.test(leadText) || hasDirectStatementStance(leadText)) &&
    !looksLikeDigestOrProgram(leadText) &&
    !looksLikeReportedInterview(leadText) &&
    !looksLikeOnlyEventNotice(leadText)
  ) {
    return {
      detectionReason: ["stance:lead_sentence"],
      documentType: "position",
      message,
    };
  }

  return null;
}

export function classifyTelegramStatementMessages(
  messages: TelegramChannelMessage[],
) {
  return messages.flatMap((message) => {
    const candidate = classifyTelegramStatementMessage(message);
    return candidate ? [candidate] : [];
  });
}

function looksLikeDigestOrProgram(text: string) {
  return DIGEST_RE.test(text) || EVENT_OR_PROGRAM_RE.test(text);
}

function looksLikeReportedInterview(text: string) {
  return REPORTED_INTERVIEW_RE.test(text);
}

function looksLikeOnlyEventNotice(text: string) {
  return WEAK_NOTICE_PATTERN.test(text) && !STANCE_PATTERN.test(text);
}

function normalizeSourceText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
