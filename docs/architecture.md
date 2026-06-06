# ProtestHub Architecture

이 문서는 구현자와 LLM 에이전트가 ProtestHub의 책임 경계와 데이터 흐름을 빠르게 파악하기 위한 기준 문서다.

## 핵심 원칙

- `src/app`은 Next.js route 진입점만 둔다. 화면 상태, view model, 도메인 규칙은 `src/features` 또는 `src/lib`에 둔다.
- 공개 목록은 `EventListOccurrence`만 사용한다. 카드에 필요한 최소 필드만 전달하고, 설명/주소/포스터/취소 URL은 상세 페이지에서만 조회한다.
- 상세 페이지는 `getEventById(id)`로 단건 조회한다. 목록 데이터를 가져와서 `find`하지 않는다.
- 필터링과 1주 단위 날짜 window는 서버에서 처리한다. 클라이언트는 이미 받은 occurrence를 누적하고 그룹핑만 한다.
- 빈 필터 배열은 “전체 조회”를 뜻한다. 전체 선택 상태는 URL query에 남기지 않는다.
- Supabase client는 빌드 안정성을 위해 `getSupabaseClient()` 또는 `getSupabaseAdminClient()` 안에서 lazy singleton으로 초기화한다.

## 디렉터리 지도

```text
src/app/
  page.tsx                       공개 목록 route. 초기 데이터 조립 결과를 클라이언트 shell에 전달한다.
  events/[id]/page.tsx           공개 상세 route. id 단건 조회를 수행한다.
  admin/candidates/page.tsx      내부 검수 route.
  api/events/route.ts            공개 목록 추가 로드 API. 다음 1주치 occurrence만 반환한다.
  api/events/calendar/route.ts   월 캘린더 요약 API. 날짜별 count와 최대 4개 샘플만 반환한다.
  api/ingest/x/route.ts          X 수집 API.

src/features/public-events/
  home-page-data.ts              공개 첫 화면 서버 데이터 조립. URL query, 목록 window, 캘린더 초깃값을 묶는다.
  home-page-client.tsx           공개 목록 클라이언트 shell. 필터, 목록, 캘린더 hook을 조립한다.
  use-event-list-window.ts       목록 추가 로드, sentinel observer, occurrence 누적 상태.
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
  candidate-card.tsx             후보 카드와 검수 액션 배치.
  publish-event-form.tsx         공개/수정 폼.
  publish-defaults.ts            공개 폼 기본값 생성 규칙.
  actions.ts                     검수 서버 액션.
  structured-event-view.ts       구조화 결과 표시 포맷.
  reason-labels.ts               후보 근거 라벨.
  text-quality.ts                LLM/OCR 실행 가능성 판정.
  navigation.ts                  검수 화면 URL 생성.

src/lib/
  events.ts                      공개 목록 window, organizer 옵션, 상세 단건 조회.
  event-query-model.ts           공개 조회 Supabase row 타입, occurrence/window 변환, 캘린더 요약 순수 함수.
  types.ts                       공개 이벤트, 목록 occurrence, 필터 타입.
  issues.ts / regions.ts         의제/지역 옵션의 단일 출처.
  format.ts                      날짜/시간 순수 util.

src/lib/x-ingest/
  run.ts                         수집 오케스트레이션.
  repository.ts                  Supabase 읽기/쓰기.
  candidate-rows.ts              x_event_candidates row 생성.
  normalize.ts                   X post 텍스트 클리닝과 후보 기준.
  x-api.ts                       X API 호출.
  config.ts                      환경변수 파싱.

src/lib/llm/
  structured-event.ts            OpenAI 호출, fallback, sanitize.
  structured-event-prompt.ts     추출 프롬프트.
  structured-event-schema.ts     JSON schema.
  structured-event-options.ts    의제/지역 enum 연결.
```

## 공개 목록 데이터 흐름

1. `src/app/page.tsx`는 `getPublicEventsHomePageData()`를 호출해 route를 얇게 유지한다.
2. `home-page-data.ts`가 `searchParams`를 `parseEventSearchState()`로 변환한다.
3. 리스트 뷰는 기준 날짜부터 1주일 window만, 캘린더 뷰는 해당 월 요약만 조회한다.
4. `getPublicEventOccurrenceWindow()`, `getPublicEventCalendarMonth()`, `getPublishedOrganizerOptions()`는 가능한 범위에서 `Promise.all`로 병렬 조회한다.
5. `HomePageClient`는 서버에서 받은 초기값을 각 hook에 넘기고, 직접 fetch/observer 세부 구현을 갖지 않는다.
6. 목록 하단 sentinel이 보이면 `use-event-list-window.ts`가 `/api/events?from=YYYY-MM-DD&...filters`를 호출해 다음 1주일을 붙인다.
7. 캘린더 월 이동은 `use-calendar-month-data.ts`가 `/api/events/calendar?month=YYYY-MM&...filters`를 호출한다.
8. 공개 목록 API들은 `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`을 붙인다.

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
- 상세는 기존 `public_event_cards`에서 id 단건을 조회한다.
- `get_public_event_occurrence_window()` RPC와 `public_event_occurrences` view는 필수다. RPC/view/index가 없으면 공개 조회가 실패하도록 두어 DB 배포 누락을 빨리 드러낸다.

## 검수와 공개

1. `/admin/candidates?secret=...`가 후보 목록을 보여준다.
2. OCR, 본문 구조화, 본문+OCR 구조화는 모두 `features/admin-candidates/actions.ts` 서버 액션을 통한다.
3. 구조화 결과는 `extraction_payload.structured_event` schema v2 형태로 저장한다.
4. 공개 기본값은 기존 공개 이벤트가 있으면 그 값을 우선하고, 없으면 구조화 결과를 사용한다.
5. 공개 적용은 `public_events` upsert, 기존 `event_dates` 삭제, 새 `event_dates` insert, 후보 `published` 갱신 순서다.
6. 공개 내리기는 `public_events` row를 삭제해 `event_dates`를 cascade 삭제하고 후보를 `needs_review`로 되돌린다.
7. 공개 후 `/`, `/events/[id]`, `/admin/candidates`를 revalidate한다. `/api/events`는 짧은 CDN TTL로 최대 60초 안에 갱신된다.

## X 수집

1. `/api/ingest/x`가 Bearer `INGEST_SECRET`을 검증한다.
2. `runXIngest()`는 운영 계정의 팔로잉 계정 목록을 읽는다.
3. 기본 수집은 계정별 최신 저장 post 이후만 가져오고, 백필 수집은 `startDate`/`startTime` 옵션으로 `since_id`를 우회한다.
4. `note_tweet.text`가 있으면 본문으로 우선 사용한다.
5. 텍스트 또는 미디어가 있는 post만 후보 row가 될 수 있다.
6. 본문에 `일시`, `날짜`, `일정` 중 하나라도 있거나 보조 신호가 3개 이상인 post를 `needs_review`, 나머지는 `ignored`로 저장한다.
7. 일반 증분 수집에서 오늘 이전 일정으로 판정되면 `ignored`와 `past_event_date` 근거를 남긴다.
8. `startDate`/`startTime` 백필 수집은 과거 일정 판정이 있어도 키워드 post를 검수 대기로 유지하고 `past_event_date` 근거만 남긴다.
9. 백필이나 장기 미수집 계정은 `maxPages` 또는 `X_BACKFILL_TIMELINE_PAGES_PER_ACCOUNT`로 계정별 timeline pagination 상한을 둔다.

## 변경 안전 규칙

- 의제나 지역 옵션을 바꿀 때는 `src/lib/issues.ts`, `src/lib/regions.ts`를 먼저 수정한다. LLM schema는 여기에서 enum을 파생한다.
- 공개 목록 성능을 건드릴 때는 `src/lib/events.ts`, `src/app/page.tsx`, `src/app/api/events/route.ts`, `supabase/schema.sql`을 함께 확인한다.
- 후보 기준을 바꿀 때는 `src/lib/x-ingest/normalize.ts`와 `src/lib/x-ingest/candidate-rows.ts`를 함께 본다.
- 공개 폼 자동 채움은 `publish-defaults.ts`만 먼저 확인한다.
- 구조화 결과 저장 형식을 바꿀 때는 `src/lib/structured-event-storage.ts`와 `docs/llm-maintenance.md`를 함께 갱신한다.
- 사용처가 없는 export, 기본 생성 asset, 오래된 호환 코드는 남기지 않는다.
