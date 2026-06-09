import type { TelegramStatementDocumentType } from "./types";

export type TelegramStatementSentenceExtractionInput = {
  documentTypeHint: TelegramStatementDocumentType;
  organizationName: string;
  sourceUrl: string;
  textSnapshot: string;
};

export function buildTelegramStatementExtractionPrompt(
  input: TelegramStatementSentenceExtractionInput,
) {
  return [
    "아래 텔레그램 메시지가 단체의 성명, 논평, 입장문, 브리핑, 기자회견문, 보도자료, 규탄문, 환영문 등 입장이 정해진 문건인지 판단한다.",
    "문건이 맞다면 핵심 입장을 가장 잘 드러내는 원문 문장 하나를 고른다.",
    "",
    "절대 규칙:",
    "- core_sentence는 메시지 원문에 실제로 존재하는 연속된 문자열이어야 한다.",
    "- 문장을 새로 쓰거나 요약하거나 어미, 조사, 띄어쓰기, 문장부호를 바꾸지 않는다.",
    "- 규탄, 촉구, 요구 같은 강한 단어 하나에만 끌리지 않는다.",
    "- 무엇에 대한 성명/논평/입장인지가 중요하다. 제목이나 전반부 리드 문장이 대상 소재와 단체의 판단을 함께 담고 있으면 뒤쪽의 짧은 요구문보다 그 문장을 우선한다.",
    "- 성명문과 논평문은 보통 전반부에 핵심 소재와 판단이 들어간다. 먼저 제목, 첫 문단, 인용문 직후의 리드 문장을 검토한다.",
    "- 단체의 요구, 규탄, 환영, 반대, 촉구, 비판, 우려, 연대, 제안, 판단이 드러나는 문장을 고른다.",
    "- 링크, 해시태그, 날짜, 장소, 참가 안내, 문의처, 서명부만 담긴 문장은 고르지 않는다.",
    "- 인물 이름과 직책만 있는 줄, 사회자/발언자 소개, 행사 순서, 내부 행동 지침은 핵심 문장으로 고르지 않는다.",
    "- '현장 스케치 영상을 공개합니다', '기자회견을 개최합니다', '보도자료: https://...'처럼 공개/개최/링크 안내만 담긴 문장은 핵심 문장이 아니다.",
    "- 보도자료나 기자회견 안내라도 단체의 요구, 규탄, 촉구, 반대, 환영, 우려가 직접 드러나는 원문 문장이 없으면 대상 문건으로 보지 않는다.",
    "- 일일 뉴스 모음, 교육영상 안내, 선전전 일정, 여행/활동 일지는 대상 문건이 아니다.",
    "- 대상 문건이라고 확신할 수 없거나 핵심 입장 문장이 애매하면 반드시 is_target_document=false, core_sentence=\"\"로 답한다.",
    "",
    `단체명: ${input.organizationName}`,
    `문서 유형 힌트: ${input.documentTypeHint}`,
    `원문 URL: ${input.sourceUrl}`,
    "",
    "메시지 원문:",
    input.textSnapshot,
  ].join("\n");
}
