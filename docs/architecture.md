# ProtestHub Architecture

이 문서는 구현자와 LLM 에이전트가 ProtestHub의 책임 경계와 데이터 흐름을 빠르게 파악하기 위한 기준 문서다.
입장문 피드의 단계별 운영 계획은 `docs/statement-feed-roadmap.md`를 함께 본다.

## 핵심 원칙

- `src/app`은 Next.js route 진입점만 둔다. 화면 상태, view model, 도메인 규칙은 `src/features` 또는 `src/lib`에 둔다.
- 공개 목록은 `EventListOccurrence`만 사용한다. 카드에 필요한 최소 필드만 전달하고, 주소/포스터/취소 URL은 상세 페이지에서만 조회한다.
- 상세 페이지는 `getEventById(id)`로 단건 조회한다. 목록 데이터를 가져와서 `find`하지 않는다.
- 필터링과 1주 단위 날짜 window는 서버에서 처리한다. 클라이언트는 이미 받은 occurrence를 누적하고 그룹핑만 한다.
- 빈 필터 배열은 “전체 조회”를 뜻한다. 전체 선택 상태는 URL query에 남기지 않는다.
- Supabase client는 빌드 안정성을 위해 `getSupabaseClient()` 또는 `getSupabaseAdminClient()` 안에서 lazy singleton으로 초기화한다.

## 디렉터리 지도

```text
src/app/
  page.tsx                       공개 목록 route. 초기 데이터 조립 결과를 클라이언트 shell에 전달한다.
  statements/page.tsx            입장문 핵심 원문 문장 공개 피드 route. 행/프로필/날짜 그룹은 같은 폴더의 `statement-*` 파일에 둔다.
  events/[id]/page.tsx           공개 상세 route. id 단건 조회를 수행한다.
  admin/candidates/page.tsx      내부 검수 route.
  api/events/route.ts            공개 목록 추가 로드 API. 다음 1주치 occurrence만 반환한다.
  api/events/calendar/route.ts   월 캘린더 요약 API. 날짜별 count와 최대 4개 샘플만 반환한다.
  api/ingest/x/route.ts          X 수집 API.
  api/ingest/telegram-statements/route.ts 텔레그램 입장문 피드 자동 수집 API.
  api/ingest/telegram-statement-extractions/route.ts 입장문 pending 후보 소량 추출 API.
  api/ingest/telegram-statement-extraction-batches/route.ts 입장문 backfill Batch API.
  api/ingest/party-statements/route.ts 정당 사이트 입장문 수집/즉시 추출 API.
  api/ingest/statement-topics/route.ts 텔레그램 confirmed topic 생성과 정당 문서 매칭 API.

src/features/public-events/
  home-page-data.ts              공개 첫 화면 서버 데이터 조립. URL query, 목록 window, 캘린더 초깃값을 묶는다.
  home-page-client.tsx           공개 목록 클라이언트 shell. 필터, 목록, 캘린더 hook을 조립한다.
  use-event-list-window.ts       목록 추가 로드, sentinel observer, occurrence 누적 상태.
  use-previous-week-pull.ts      미래 날짜 리스트에서 오늘까지 되돌아가는 모바일 pull 보강.
  use-calendar-month-data.ts     캘린더 월 변경 fetch와 calendar URL 반영.
  use-filter-overlay-lock.ts     필터 패널 오픈 시 문서 scroll lock class 관리.
  use-home-filter-state.ts       필터 패널 draft/reducer.
  filters.ts                     URL query 파싱, 조건 칩, 필터 query 생성.
  event-list-model.ts            occurrence 병합과 날짜/시간별 그룹핑 순수 함수.
  calendar-month-model.ts        월 캘린더 6주 그리드, 요일, 날짜 cell label 순수 함수.
  calendar-month-view.tsx        월 캘린더 렌더링. 날짜 클릭 시 리스트 진입.
  view-mode-switch.tsx           리스트/캘린더 단일 전환 버튼.
  filter-sheet.tsx               하단 필터 패널.
  event-timeline.tsx             날짜/시간별 목록 렌더링.
  event-card.tsx                 목록 카드. EventListOccurrence만 받는다.
  event-detail-client.tsx        상세/취소 상세 화면.
  issue-badge.tsx                의제 badge 공통 컴포넌트.

src/features/admin-candidates/
  page.tsx                       검수 화면 조립.
  admin-control-panels.tsx       X/텔레그램/수동 추가 control panel 조립.
  candidate-filter-tabs.tsx      검수 상태/범위 tab 렌더링.
  admin-unauthorized.tsx         관리자 secret 누락/오류 화면.
  candidate-card.tsx             후보 카드 레이아웃 조립.
  candidate-processing-forms.tsx 후보 OCR/구조화/이미지 보강 폼.
  candidate-status-forms.tsx     후보 상태 변경 버튼.
  admin-hidden-fields.tsx        검수 액션 공통 hidden field.
  detail-hydration-action.tsx    X 상세 수집 버튼과 상태 문구.
  manual-telegram-link-form.tsx  텔레그램 채널 메시지 공유 링크 수동 추가.
  structured-event-summary.tsx   후보 카드 안 구조화 결과 요약.
  publish-event-form.tsx         공개/수정 폼.
  publish-defaults.ts            공개 폼 기본값 생성 규칙.
  manual-candidate-actions.ts    X/텔레그램 수동 후보 추가 서버 액션.
  x-ingest-actions.ts            X 수집 패널 서버 액션.
  telegram-channel-actions.ts    텔레그램 구독 채널 관리/수집 서버 액션.
  candidate-processing-actions.ts 후보 보강, OCR, 구조화 서버 액션.
  candidate-status-actions.ts    후보 상태 변경 서버 액션.
  publication-actions.ts         공개 저장/공개 내리기 서버 액션.
  action-states.ts               클라이언트 폼 action state 타입.
  action-utils.ts                서버 액션 공통 helper.
  action-form-data.ts            FormData 파싱, 관리자 검증, 복귀 URL 생성.
  candidate-publication.ts       공개/비공개 후보 조회, reason 정리, revalidate 범위.
  candidate-ocr.ts               OCR 대상 조회, 이미지 URL 준비, OCR update 생성.
  structured-event-view.ts       구조화 결과 표시 포맷.
  reason-labels.ts               후보 근거 라벨.
  text-quality.ts                LLM/OCR 실행 가능성 판정.
  navigation.ts                  검수 화면 URL 생성.

src/lib/
  events.ts                      공개 목록 window, organizer 옵션, 상세 단건 조회.
  event-query-model.ts           공개 조회 Supabase row 타입, occurrence/window 변환, 캘린더 요약 순수 함수.
  public-event-date-policy.ts    공개 조회의 오늘 기준, 1주 window, 과거 날짜 clamp 정책.
  date-key.ts                    한국 시간대 YYYY-MM-DD key 계산과 date/month key 비교.
  event-date-filter.ts           X 후보 본문에서 일정 날짜를 추출하고 과거 일정 여부를 판정.
  types.ts                       공개 이벤트, 목록 occurrence, 필터 타입.
  issues.ts / regions.ts         의제/지역 옵션의 단일 출처.
  format.ts                      날짜/시간 순수 util.
  review-candidate-source.ts     후보 출처 타입과 UI 라벨.

src/lib/telegram/
  channel-page.ts                텔레그램 공개 채널 HTML fetch와 메시지 파싱.
  channel-subscription-types.ts  텔레그램 구독/스캔 공통 타입과 DB row mapper.
  channel-subscription-repository.ts 텔레그램 구독 목록 조회, 추가, 상태 변경, 커서 갱신.
  channel-subscription-scan.ts   텔레그램 구독 채널 페이지 순회와 스캔 오케스트레이션.
  channel-candidate-ingest.ts    텔레그램 메시지를 review_candidates/source_media row로 저장.
  candidate-images.ts            검수 카드에서 텔레그램 메시지 이미지를 수동 재수집.
  event-broadcasts.ts            텔레그램 브리핑 발송 공개 진입점.
  event-broadcast-targets.ts     브리핑 대상 occurrence/event 조회.
  event-broadcast-repository.ts  브리핑 claim, sent/failed 상태 저장, channel id 확인.
  event-broadcast-payload.ts     브리핑 payload hash와 dry-run 결과 생성.
  event-broadcast-dates.ts       브리핑 기본 대상 날짜와 occurrence 날짜 선택.
  event-broadcast-types.ts       브리핑 batch/outcome/DB row 타입.
  html.ts                        텔레그램 공개 페이지 HTML fetch/파싱 공용 util.
  manual-link.ts                 텔레그램 수동 링크 후보 생성 오케스트레이션.
  manual-link-parser.ts          텔레그램 메시지 공유 링크 파싱.
  manual-link-preview.ts         텔레그램 메시지 공개 preview 수집.
  manual-link-repository.ts      텔레그램 수동 링크 후보/media 저장.
  manual-link-types.ts           텔레그램 수동 링크 공통 타입과 strategy 상수.
  message-images.ts              텔레그램 메시지 HTML의 이미지 URL 추출 공용 util.

src/lib/telegram-statements/
  run.ts                         입장문 피드용 매시 정각 자동 수집 오케스트레이션.
  channel-scan.ts                채널 단위 lock, 수집, 저장 흐름.
  message-collection.ts          신규/백필 텔레그램 메시지 페이지 수집.
  scan-cursor.ts                 메시지 cursor, cutoff, page 중단 조건.
  run-config.ts                  스캔 page/window/lock TTL 설정.
  repository.ts                  기존 import 경로 유지를 위한 repository barrel.
  repository-client.ts           service-role Supabase client guard.
  repository-scan.ts             스캔 저장소 compatibility barrel.
  repository-scan-run.ts         텔레그램 입장문 scan run 생성/종료.
  repository-subscription.ts     요약 피드 대상 채널 조회.
  repository-scan-state.ts       전용 cursor/lock 상태 저장.
  repository-message-upsert.ts   원문 메시지와 pending 후보 저장.
  repository-extraction.ts       추출 저장소 compatibility barrel.
  repository-extraction-query.ts pending/queued 후보와 원문 본문 조회.
  repository-extraction-status.ts extracted/skipped/failed/queued 상태 저장.
  repository-batch.ts            OpenAI Batch row 생성, 제출, 완료 결과 저장.
  classifier.ts                  텍스트 본문 기준 성명/논평/입장문/보도자료/규탄/환영 후보 판정.
  rule-extractor.ts              rule 기반 핵심 문장 선택 오케스트레이션.
  rule-patterns.ts               rule extractor 정규식/threshold.
  rule-candidates.ts             rule 후보 수집.
  rule-scoring.ts                rule 후보 점수화.
  rule-headline.ts / rule-opening.ts 첫머리 우선 추출.
  extractor.ts                   OpenAI 추출 facade.
  extraction-request.ts          Responses API 요청 body와 호출.
  extraction-output.ts           Responses 출력 파싱/sanitize.
  extraction-result.ts           원문 포함 검증과 결과 변환.
  sentence-match.ts              exact/whitespace-normalized 원문 위치 매칭.
  batch.ts                       backfill용 Batch orchestration.
  batch-openai.ts                OpenAI Batch/File 호출.
  batch-prepare.ts               Batch row 준비와 queued lock.
  batch-import.ts                Batch 결과 import.
  extraction-run.ts              pending 후보 소량 처리와 extracted/skipped/failed 상태 갱신.
  public-feed.ts                 공개 `/statements` 피드 조회 orchestration.
  public-feed-sources.ts         텔레그램/정당 공개 row 조회.
  public-feed-time.ts            시간 미상/정렬 정책.
  types.ts                       입장문 피드 수집 타입.

src/lib/party-statements/
  run.ts                         정당 사이트 수집 전체 orchestration.
  source-runner.ts               source별 목록/상세 fetch와 저장 흐름.
  summary-extraction.ts          정당 summary 즉시 추출/품질 게이트.
  sources.ts                     정당 source 목록과 sourceKey 필터.
  sources/people-power.ts        국민의힘 HTML parser.
  sources/theminjoo.ts           더불어민주당 HTML parser.
  sources/reform-party.ts        개혁신당 HTML parser.
  repository.ts                  정당 저장소 compatibility barrel.
  source-repository.ts           source scan 상태 저장.
  document-repository.ts         정당 원문 document 저장/본문 조회.
  summary-repository.ts          summary 후보와 추출 상태 저장.
  public-repository.ts           공개 summary 조회.
  html.ts                        정당 사이트 fetch, HTML 정리, 날짜/category mapping util.
  types.ts                       정당 사이트 수집 타입.

src/lib/statement-topics/
  run.ts                         topic gate 실행 순서 오케스트레이션.
  embedding-prep.ts              텔레그램/정당 row embedding 준비.
  embedding-cache.ts             topic embedding 재사용/생성과 DB 저장.
  clustering.ts                  텔레그램 extracted row clustering과 best-match 선택.
  topic-persistence.ts           confirmed telegram topic 저장.
  party-matching.ts              정당 row를 confirmed/cross-source topic에 매칭.
  cross-source-topic.ts          텔레그램-정당 직접 매칭 topic 저장.
  lexical-support.ts             0.4대 embedding 유사도 보강용 소재 어휘 검증.
  types.ts                       topic matching 내부 공유 타입.
  repository.ts                  topic 저장소 compatibility barrel.
  summary-repository.ts          매칭 대상 텔레그램/정당 summary 조회.
  embedding-repository.ts        embedding row 조회/저장.
  topic-repository.ts            topic/link 저장.
  party-gate-repository.ts       정당 topic gate 상태 저장.
  embedding.ts                   OpenAI Embeddings API 호출과 cosine similarity 계산.
  config.ts                      topic window, threshold, embedding model 설정.

src/lib/x-ingest/
  run.ts                         수집 오케스트레이션.
  repository.ts                  X 저장소 compatibility barrel.
  ingest-run-repository.ts       ingest run 생성/종료와 counters.
  account-repository.ts          계정 저장소 compatibility barrel.
  account-storage-repository.ts  계정 저장/조회.
  account-cursor-repository.ts   계정별 수집 cursor 조회/갱신.
  post-repository.ts             X post 저장.
  media-repository.ts            source_media와 post-media link 저장.
  candidate-repository.ts        review candidate 저장.
  candidate-rows.ts              review_candidates row 생성.
  candidate-detail-hydration.ts  관리자 요청 기반 X 상세 수집 orchestration.
  candidate-detail-repository.ts 상세 수집 대상 조회와 후보 update.
  hydration-state.ts             상세 수집 전/완료, 첨부 키 병합, hydrate 사유 판정.
  normalize.ts                   X normalize compatibility barrel.
  normalize-rules.ts             후보 생성/검수 heuristic.
  normalize-signals.ts           텍스트/미디어 신호 계산.
  normalize-keywords.ts          X 후보 키워드/정규식.
  normalize-text.ts              X post 본문/URL/media key helper.
  review-promotion.ts            ignored 후보 승격 orchestration.
  review-promotion-decision.ts   ignored 후보 승격 판정.
  review-promotion-repository.ts ignored 후보 조회/승격 update.
  review-promotion-overlap.ts    공개 일정 중복 추정.
  x-api.ts                       X API 호출.
  config.ts                      환경변수 파싱.

src/lib/llm/
  structured-event.ts            OpenAI 호출과 fallback orchestration.
  structured-event-config.ts     모델/env 설정, reasoning option 생성.
  structured-event-output.ts     Responses 출력 파싱, 결과 sanitize, output 오류 요약.
  structured-event-prompt.ts     추출 프롬프트.
  structured-event-schema.ts     JSON schema.
  structured-event-options.ts    의제/지역 enum 연결.
```

## 공개 목록 데이터 흐름

1. `src/app/page.tsx`는 `getPublicEventsHomePageData()`를 호출해 route를 얇게 유지한다.
2. `home-page-data.ts`가 `searchParams`를 `parseEventSearchState()`로 변환한다.
3. `public-event-date-policy.ts`가 오늘 이전 날짜/월 query를 오늘 기준으로 보정한다.
4. 리스트 뷰는 기준 날짜부터 1주일 window만, 캘린더 뷰는 해당 월 요약만 조회한다.
5. `getPublicEventOccurrenceWindow()`, `getPublicEventCalendarMonth()`, `getPublishedOrganizerOptions()`는 가능한 범위에서 `Promise.all`로 병렬 조회한다.
6. `HomePageClient`는 서버에서 받은 초기값을 각 hook에 넘기고, 직접 fetch/observer 세부 구현을 갖지 않는다.
7. 목록 하단 sentinel이 보이면 `use-event-list-window.ts`가 `/api/events?from=YYYY-MM-DD&...filters`를 호출해 다음 1주일을 붙인다.
8. 미래 날짜 리스트에서 화면 상단을 아래로 당기면 이전 1주일을 붙이되 오늘 이전으로는 내려가지 않는다.
9. 캘린더 월 이동은 `use-calendar-month-data.ts`가 `/api/events/calendar?month=YYYY-MM&...filters`를 호출한다.
10. 공개 목록 API들은 `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`을 붙인다.

## Supabase 공개 조회 구조

목록 추가 로드는 `get_public_event_occurrence_window()` RPC를 사용한다.

```sql
get_public_event_occurrence_window(
  p_from_date date,
  p_window_days integer,
  p_issue_filters text[],
  p_region_filters text[],
  p_organizer_filters text[]
)
```

- 목록 API는 RPC 1회로 해당 1주 window의 occurrence와 `has_more_events`를 함께 받는다.
- RPC는 `event_dates`와 `public_events`를 직접 조회하며, 빈 필터 배열은 전체 조회로 처리한다.
- RPC 응답 row와 JSON payload 변환은 `src/lib/event-query-model.ts`의 순수 함수가 담당한다.

캘린더 월 요약과 상세 카드의 기준 view는 `public_event_occurrences`, `public_event_cards`다.

```sql
public_event_occurrences
  id
  title
  venue
  region
  source_account_name
  issue_tags
  primary_issue
  occurrence_date
  occurrence_start_time
```

- 캘린더는 `public_event_occurrences` view에서 날짜 범위와 필터를 적용한다.
- 공개 캘린더 조회는 오늘 이전 occurrence를 payload에 포함하지 않는다.
- 상세는 기존 `public_event_cards`에서 id 단건을 조회한다.
- `get_public_event_occurrence_window()` RPC와 `public_event_occurrences` view는 필수다. RPC/view/index가 없으면 공개 조회가 실패하도록 두어 DB 배포 누락을 빨리 드러낸다.

## 검수와 공개

1. `/admin/candidates?secret=...`가 후보 목록을 보여준다.
2. OCR, 본문 구조화, 본문+OCR 구조화는 `candidate-processing-actions.ts` 서버 액션을 통하되, OCR update 조립은 `candidate-ocr.ts`에 둔다.
3. 구조화 결과는 상세설명 없이 `extraction_payload.structured_event` schema v3 형태로 저장한다.
4. 공개 기본값은 기존 공개 이벤트가 있으면 그 값을 우선하고, 없으면 구조화 결과를 사용한다.
5. 공개/비공개 후보 조회, 공개 payload marker 제거, 공개 reason 교체, revalidate 범위는 `candidate-publication.ts`에 둔다.
6. 공개 적용은 `public_events` upsert, 기존 `event_dates` 삭제, 새 `event_dates` insert, 후보 `published` 갱신 순서다.
7. 공개 내리기는 `public_events` row를 삭제해 `event_dates`를 cascade 삭제하고 후보를 `needs_review`로 되돌린다.
8. 공개 후 `/`, `/events/[id]`, `/admin/candidates`를 revalidate한다. `/api/events`는 짧은 CDN TTL로 최대 60초 안에 갱신된다.

## 검수 후보 출처 모델

- 검수 후보의 기준 테이블은 `review_candidates`다. 과거 `x_event_candidates` 이름을 쓰지 않는다.
- 후보 출처는 `source_type`, `source_record_id`, `source_name`, `source_url`로 표현한다.
- `source_type`은 현재 `x`, `telegram`을 허용한다.
- X 후보의 `source_record_id`는 X post id다. X 원천 데이터는 `x_accounts`, `x_posts`, `x_post_media`에 남긴다.
- Telegram 후보의 `source_record_id`는 `telegram:<channel>:<message_id>` 형식이다.
- 후보 이미지와 OCR 대상 media는 `source_media`에 저장한다. X media도 이 테이블을 사용한다.
- 후보 생성/검수 사유는 `review_reason`에 저장한다.
- 공개 이벤트 저장 시에는 후보의 `source_name`, `source_url`을 `public_events.source_account_name`, `public_events.source_post_url`에 복사한다. 공개 테이블의 컬럼명은 기존 필터/view와 연결되어 있어 아직 유지한다.

## Telegram 링크 수동 추가

1. `/admin/candidates`의 "텔레그램 링크 추가" 패널에서 `https://t.me/<channel>/<message_id>` 링크를 입력한다.
2. 서버 액션은 `src/lib/telegram/manual-link.ts`의 `ingestManualTelegramLink()`를 호출한다.
3. 링크 파싱은 `manual-link-parser.ts`, 공개 preview 수집은 `manual-link-preview.ts`, 후보/media 저장은 `manual-link-repository.ts`가 맡는다.
4. 공개 `t.me` 페이지에서 본문, title, OG image를 가능한 범위에서 수집한다.
5. 공개 페이지에서 본문을 읽지 못할 수 있으므로 관리자가 메시지 본문을 선택 입력으로 붙여넣을 수 있다.
6. 생성된 후보는 `source_type = telegram`, `status = needs_review`, `review_reason`에 `manual_telegram_link`, `manual_review_requested`를 가진다.
7. 이후 OCR, 본문 구조화, 본문+OCR 구조화, 공개 저장은 기존 검수 파이프라인을 그대로 탄다.

## Telegram 브리핑 발송

1. `/api/broadcast/telegram`은 `event-broadcasts.ts`의 `broadcastPendingTelegramEvents()` 또는 `broadcastPublishedEventToTelegram()`만 호출한다.
2. 기본 대상 날짜는 `event-broadcast-dates.ts`에서 한국 날짜 기준 내일로 계산한다.
3. 발송 대상 조회는 `event-broadcast-targets.ts`에서 `public_event_occurrences`, `public_event_cards`, `telegram_event_broadcasts`를 함께 확인한다.
4. 발송 dedupe는 `event-broadcast-repository.ts`의 `claim_telegram_event_broadcast` RPC 호출로 처리한다.
5. payload hash와 dry-run 결과는 `event-broadcast-payload.ts`가 생성한다.
6. 실제 Telegram API 호출과 메시지/버튼 포맷은 `broadcast.ts`가 담당한다.
7. 메시지 본문은 제목, 날짜/시간, 장소만 유지한다. 상세 정보는 상세페이지/원본 버튼으로 보낸다.

## Telegram 채널 구독 수집

1. `/admin/candidates`의 "텔레그램 채널 구독" 패널에서 공개 채널 username 또는 `https://t.me/<channel>` 링크를 추가한다.
2. 구독 목록은 `telegram_channel_subscriptions`에 저장한다. `channel_username`, `channel_title`, `source_url`, `status`, `last_checked_message_id`, `last_checked_message_at`, `last_checked_at`이 핵심 커서다.
3. 구독 저장/커서 갱신은 `channel-subscription-repository.ts`, 공개 웹 페이지 순회는 `channel-subscription-scan.ts`, 후보 저장은 `channel-candidate-ingest.ts`에 둔다.
4. 공개 웹 페이지 `https://t.me/s/<channel>`을 읽고, 오래된 페이지는 `?before=<message_id>`로 이동한다.
5. 신규 채널처럼 탐색 기록이 없으면 첫 수집에서 최대 60일 전까지 확인한다. 이미 수집한 채널은 `last_checked_message_id` 이후 메시지만 후보화한다.
6. 구독 채널 메시지는 텍스트 또는 이미지가 있으면 `review_candidates`에 `source_type = telegram`으로 저장한다. 단, `needs_review` 승격 여부는 X 후보와 같은 `shouldReviewCandidate()` 기준을 따른다.
7. 승격 기준을 만족하지 못하거나 오늘 이전 일정으로 판정된 메시지는 `ignored`로 저장한다. 기존 후보가 있으면 덮어쓰지 않는다.
8. 후보 `review_reason`에는 `telegram_channel_subscription`, `telegram_auto_scan`과 함께 기존 후보 기준의 `review_rule:*`, 날짜/장소/미디어 신호, `past_event_date` 등을 남긴다.
9. 텔레그램 채널 수집은 OCR이나 LLM 구조화를 자동 실행하지 않는다. 관리자가 검수 카드에서 필요할 때 이미지 불러오기, OCR, 본문 구조화를 실행한다.
10. 텔레그램 이미지가 자동으로 붙지 않은 후보는 검수 카드의 "텔레그램 이미지 불러오기"로 원본 메시지를 다시 읽고 `source_media`, 후보 `media_keys`를 갱신한다.
11. 채널 구독을 삭제해도 이미 만들어진 검수 후보는 삭제하지 않는다. 후보의 공개/무시/중복 처리는 기존 검수 흐름에서 별도로 한다.

## Telegram 입장문 피드 자동 수집

1. `/api/ingest/telegram-statements`는 Vercel Cron이 매시 정각마다 `GET`으로 호출한다.
2. 이 API는 Bearer `CRON_SECRET`을 검증하고, `dryRun=true`, `channel=<username>`, `maxPages=<n>` query를 지원한다.
3. 채널 목록은 기존 `telegram_channel_subscriptions`를 재사용하되 `statement_feed_enabled = true`인 active 채널만 본다. 기본 제외 채널은 `workers2016`, `platformc`, `leftall`이다.
4. 기존 수동 텔레그램 후보 수집의 `last_checked_message_id`는 변경하지 않는다. 첫 자동 실행의 시작점으로 읽기만 하고, 이후에는 `telegram_statement_scan_states`의 전용 cursor만 갱신한다.
5. 원문 텍스트가 있는 새 메시지는 `telegram_statement_messages`에 저장한다. 이미지-only 또는 본문이 없는 메시지는 OCR 없이 제외한다.
6. `classifier.ts`가 성명, 논평, 입장문, 기자회견문, 보도자료, 규탄/환영 문건 또는 강한 입장 표명을 텍스트 룰로 판정하고, 후보는 `telegram_statement_summaries`에 `status = pending`으로 저장한다.
7. `/api/ingest/telegram-statement-extractions`는 pending 후보를 읽고 먼저 `rule-extractor.ts`로 명확한 핵심 원문 문장을 찾는다. 성공하면 OpenAI를 호출하지 않고 `model = rule-v1`로 저장한다.
8. rule 추출이 애매하면 `extractor.ts`가 OpenAI로 핵심 원문 문장 1개를 선택한다. 모델 입력은 `OPENAI_STATEMENT_EXTRACTION_INPUT_CHARS`만큼 앞부분으로 제한할 수 있지만, 선택 문장이 `telegram_statement_messages.text_snapshot` 전체에 실제로 포함되지 않으면 저장하지 않고 실패 처리한다.
9. backfill처럼 pending이 많은 경우 `/api/ingest/telegram-statement-extraction-batches` `POST`가 OpenAI Batch job을 만들고 대상 row를 `queued`로 잠근다. 완료 후 같은 route의 `GET ?batchId=<id>&importResults=true`가 결과를 가져와 `extracted/skipped/failed`로 마무리한다.
10. `telegram_statement_summaries`는 공개 조회를 대비해 `status = extracted` row만 anon/authenticated가 읽을 수 있다. 수집 원문과 cursor/run/batch 테이블은 service-role 전용이다.
11. `/statements`는 `telegram_statement_summaries.status = extracted` row를 최신순으로 보여주며, 각 행은 원본 텔레그램 메시지 링크로 연결한다.

## 정당 사이트 입장문 자동 수집

1. `/api/ingest/party-statements`는 Vercel Cron이 1시간마다 `GET`으로 호출한다.
2. 이 API는 Bearer `CRON_SECRET`을 검증하고, `dryRun=true`, `source=<key>`, `limit=<n>` query를 지원한다.
3. 1단계 source는 국민의힘 `people_power_party`, 더불어민주당 `theminjoo`, 개혁신당 `reform_party`다. 조국혁신당은 제외한다.
4. parser는 category가 `성명`, `성명서`, `논평`, `브리핑`, `서면브리핑`, `기자회견문`인 항목만 저장한다. 일반 `보도자료`는 제외한다.
5. 상세 HTML 본문 텍스트만 사용하며 OCR은 쓰지 않는다.
6. 저장된 본문은 기존 입장문 추출 흐름과 같이 rule 우선, OpenAI fallback, 전체 원문 exact-match 검증을 거친다.
7. `/api/ingest/statement-topics`는 최근 48시간의 텔레그램 `extracted` row를 embedding cluster로 묶고, 서로 다른 텔레그램 출처 2곳 이상이 포함된 cluster를 confirmed topic으로 저장한다.
8. 텔레그램끼리 confirmed topic이 없어도 정당 사이트 row와 텔레그램 row의 embedding 유사도가 `STATEMENT_TOPIC_CROSS_SOURCE_THRESHOLD` 이상이면 cross-source topic으로 저장하고 정당 사이트 row를 `matched` 처리한다.
9. 정당 사이트 `extracted` row는 confirmed topic 또는 cross-source topic과 embedding 매칭될 때 `topic_gate_status = matched`가 된다. 매칭되지 않으면 `unmatched`로 남고 공개되지 않는다.
10. `/statements`는 텔레그램 extracted row와 `topic_gate_status in ('matched', 'manual_matched')`인 정당 사이트 row를 합쳐 최신순으로 보여준다.

## X 수집

1. `/api/ingest/x`가 Bearer `INGEST_SECRET`을 검증한다.
2. 기본 수집은 X 팔로잉 목록 API를 호출하지 않고 `x_accounts`에 저장된 `is_following=true`, `is_protected=false` 계정만 읽는다.
3. 팔로잉 목록을 새로 반영해야 할 때는 `/admin/candidates`의 X 수집 실행 패널에서 "팔로잉 갱신 후 수집"을 누른다. API로 직접 실행해야 할 때만 `/api/ingest/x?refreshFollowing=true`를 사용한다.
4. 기본 수집은 `x_accounts`의 계정별 수집 커서를 기준으로 가져온다. `last_ingested_post_id`가 최근 30일 안이면 `since_id`를 쓰고, 커서가 없거나 너무 오래됐으면 최대 `now - 30일`까지만 `start_time`으로 조회한다.
5. timeline 1차 요청은 `tweet.fields`만 사용하고 `expansions`, `media.fields`, `user.fields`를 붙이지 않는다.
6. 공식 계정의 리포스트 wrapper는 후보로 만들지 않는다. 대신 `referenced_tweets.type=retweeted` 원포스트 id만 모아 `/2/tweets?ids=...`로 원포스트를 hydrate하고 후보화한다.
7. 원포스트 작성자는 팔로잉 계정으로 승격하지 않고 `is_following=false` 참조 계정으로만 저장한다.
8. 기본 `hydrateMode`는 `deferred`다. 리포스트 원포스트 예외를 제외하면, 1차 수집은 원문, 날짜/장소 신호, 첨부 media key, 인용 post id만 저장하고 X 상세 API를 자동 호출하지 않는다.
9. 첨부나 인용이 있어 상세 수집이 필요한 후보만 `x_detail_deferred` 근거와 `pending_media_keys`, `pending_quoted_post_ids`를 가진다.
10. 관리자가 해당 후보 카드의 `X 상세 수집` 또는 수집 패널의 `검수 대기 상세 수집`을 누를 때만 `/2/tweets?ids=...` 상세 요청으로 hydrate한다. 이때 media URL, alt text, referenced tweet, author expansion을 가져온다.
11. 상세 수집이 끝나면 `candidate-detail-hydration.ts`가 `x_posts`, `source_media`, `x_post_media`, `review_candidates`를 갱신하고 `extraction_payload.x_hydration.status = "hydrated"`로 바꾼다.
12. `note_tweet.text`가 있으면 본문으로 우선 사용한다.
13. 텍스트 또는 첨부 media key가 있는 post만 후보 row가 될 수 있다.
14. 본문에 `일시`, `날짜`, `일정` 중 하나라도 있거나 보조 신호가 3개 이상인 post를 `needs_review`, 나머지는 `ignored`로 저장한다.
15. 일반 증분 수집에서 오늘 이전 일정으로 판정되면 `ignored`와 `past_event_date` 근거를 남긴다.
16. `startDate`/`startTime` 백필 수집은 `since_id`를 우회하지만, 요청 시작 시각이 30일보다 오래됐으면 30일 전으로 잘라서 조회한다.
17. 계정별 timeline 조회가 끝나면 `x_accounts.last_ingested_at`, `last_ingested_post_id`, `last_ingested_post_created_at`, `last_ingest_run_id`를 갱신한다. 신규 계정에 post가 없어도 `last_ingested_at`은 남겨 다음 수집에서 같은 30일 범위를 반복 조회하지 않는다.
18. 백필이나 장기 미수집 계정은 `maxPages` 또는 `X_BACKFILL_TIMELINE_PAGES_PER_ACCOUNT`로 계정별 timeline pagination 상한을 둔다.
19. 리포스트 원문만 한시적으로 보강할 때는 `/api/ingest/x?retweetOriginalsOnly=true&startDate=YYYY-MM-DD`를 사용한다.
20. `retweetOriginalsOnly=true` 실행은 팔로잉 계정의 일반 포스트를 후보로 만들지 않고, 원문 작성자가 이미 팔로잉 계정인 리포스트도 제외한다.
21. 같은 실행은 팔로우하지 않는 원문 작성자의 포스트만 추가 후보로 만들며, 계정별 `last_ingested_*` cursor를 갱신하지 않는다.
22. ignored 후보 승격 검사는 총 1000건 같은 하드 제한을 두지 않는다. Supabase `range()` 페이지를 반복 조회해 전체 ignored 후보를 검사한다.

## 변경 안전 규칙

- 의제나 지역 옵션을 바꿀 때는 `src/lib/issues.ts`, `src/lib/regions.ts`를 먼저 수정한다. LLM schema는 여기에서 enum을 파생한다.
- 공개 목록 성능을 건드릴 때는 `src/lib/events.ts`, `src/app/page.tsx`, `src/app/api/events/route.ts`, `supabase/schema.sql`을 함께 확인한다.
- 공개 조회 날짜 정책을 바꿀 때는 `src/lib/public-event-date-policy.ts`를 먼저 수정하고 route/hook에 직접 날짜 clamp를 추가하지 않는다.
- 후보 기준을 바꿀 때는 `src/lib/x-ingest/normalize.ts`와 `src/lib/x-ingest/candidate-rows.ts`를 함께 본다.
- 공개 폼 자동 채움은 `publish-defaults.ts`만 먼저 확인한다.
- 구조화 결과 저장 형식을 바꿀 때는 `src/lib/structured-event-storage.ts`와 `docs/llm-maintenance.md`를 함께 갱신한다.
- 사용처가 없는 export, 기본 생성 asset, 오래된 호환 코드는 남기지 않는다.
