export const STRONG_EVENT_KEYWORDS = [
  "집회",
  "시위",
  "1인시위",
  "기자회견",
  "문화제",
  "추모문화제",
  "행진",
  "농성",
  "촛불",
  "퍼레이드",
  "결의대회",
  "선전전",
  "피켓팅",
  "피켓 시위",
  "궐기",
  "추모제",
  "오체투지",
  "행동의 날",
];

export const WEAK_EVENT_KEYWORDS = [
  "모입니다",
  "모여",
  "참여",
  "참가",
  "함께",
  "연대",
  "행동",
  "대회",
  "집결",
];

export const NOTICE_ONLY_KEYWORDS = [
  "성명",
  "논평",
  "보도자료",
  "입장문",
  "카드뉴스",
  "토론회",
  "강연",
  "교육",
  "세미나",
  "웨비나",
  "간담회",
  "후원",
  "채용",
  "모집",
  "공모",
  "축하",
];

export const NON_EVENT_SUPPRESSION_KEYWORDS = [
  "성명",
  "논평",
  "보도자료",
  "입장문",
  "카드뉴스",
  "토론회",
  "강연",
  "교육",
  "세미나",
  "웨비나",
  "간담회",
  "채용",
  "모집",
  "공모",
  "축하",
];

export const REVIEW_KEYWORDS = ["일시", "날짜", "일정"];
export const MIN_WEAK_EVENT_KEYWORDS_FOR_REVIEW = 3;
export const ONE_TIME_DONATION_PATTERN = /일시\s*후원(?:하기)?/g;
export const DATE_HINT_PATTERN =
  /(\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}[./-]\d{1,2}|오늘|내일|모레|이번\s*(주|주말)|다음\s*(주|주말)|오전|오후|\d{1,2}\s*시|\d{1,2}:\d{2})/;
export const PLACE_HINT_PATTERN =
  /(광장|역|출구|앞|시청|구청|군청|국회|대사관|영사관|법원|검찰청|경찰청|본관|거리|공원|집결|행진|로터리|사거리|분향소|센터|회관|빌딩|타워)/;
