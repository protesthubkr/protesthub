# ProtestHub Architecture

이 문서는 구현자와 LLM 에이전트가 ProtestHub의 책임 경계와 데이터 흐름을 빠르게 파악하기 위한 기준 문서다.

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
  events/[id]/page.tsx           공개 상세 route. id 단건 조회를 수행한다.
  admin/candidates/page.tsx      내부 검수 route.
  api/events/route.ts            공개 목록 추가 로드 API. 다음 1주치 occurrence만 반환한다.
  api/events/calendar/route.ts   월 캘린더 요약 API. 날짜별 count와 최대 4개 샘플만 반환한다.
  api/ingest/x/route.ts          X 수집 API.

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
  candidate-card.tsx             후보 카드 레이아웃 조립.
  candidate-action-forms.tsx     후보 상태/OCR/구조화 실행 폼.
  admin-hidden-fields.tsx        검수 액션 공통 hidden field.
  detail-hydration-action.tsx    X 상세 수집 버튼과 상태 문구.
  structured-event-summary.tsx   후보 카드 안 구조화 결과 요약.
  publish-event-form.tsx         공개/수정 폼.
  publish-defaults.ts            공개 폼 기본값 생성 규칙.
  actions.ts                     검수 서버 액션 orchestration.
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

src/lib/x-ingest/
  run.ts                         수집 오케스트레이션.
  repository.ts                  Supabase 읽기/쓰기와 저장된 X post 첨부 키 조회.
  candidate-rows.ts              x_event_candidates row 생성.
  candidate-detail-hydration.ts  관리자 요청 기반 X 상세 수집.
  hydration-state.ts             상세 수집 전/완료, 첨부 키 병합, hydrate 사유 판정.
  normalize.ts                   X post 텍스트 클리닝과 후보 기준.
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
2. OCR, 본문 구조화, 본문+OCR 구조화는 모두 `features/admin-candidates/actions.ts` 서버 액션을 통하되, OCR update 조립은 `candidate-ocr.ts`에 둔다.
3. 구조화 결과는 상세설명 없이 `extraction_payload.structured_event` schema v3 형태로 저장한다.
4. 공개 기본값은 기존 공개 이벤트가 있으면 그 값을 우선하고, 없으면 구조화 결과를 사용한다.
5. 공개/비공개 후보 조회, 공개 payload marker 제거, 공개 reason 교체, revalidate 범위는 `candidate-publication.ts`에 둔다.
6. 공개 적용은 `public_events` upsert, 기존 `event_dates` 삭제, 새 `event_dates` insert, 후보 `published` 갱신 순서다.
7. 공개 내리기는 `public_events` row를 삭제해 `event_dates`를 cascade 삭제하고 후보를 `needs_review`로 되돌린다.
8. 공개 후 `/`, `/events/[id]`, `/admin/candidates`를 revalidate한다. `/api/events`는 짧은 CDN TTL로 최대 60초 안에 갱신된다.

## X 수집

1. `/api/ingest/x`가 Bearer `INGEST_SECRET`을 검증한다.
2. 기본 수집은 X 팔로잉 목록 API를 호출하지 않고 `x_accounts`에 저장된 `is_following=true`, `is_protected=false` 계정만 읽는다.
3. 팔로잉 목록을 새로 반영해야 할 때는 `/admin/candidates`의 X 수집 실행 패널에서 "팔로잉 갱신 후 수집"을 누른다. API로 직접 실행해야 할 때만 `/api/ingest/x?refreshFollowing=true`를 사용한다.
4. 기본 수집은 `x_accounts`의 계정별 수집 커서를 기준으로 가져온다. `last_ingested_post_id`가 최근 30일 안이면 `since_id`를 쓰고, 커서가 없거나 너무 오래됐으면 최대 `now - 30일`까지만 `start_time`으로 조회한다.
5. timeline 1차 요청은 `tweet.fields`만 사용하고 `expansions`, `media.fields`, `user.fields`를 붙이지 않는다.
6. 기본 `hydrateMode`는 `deferred`다. 1차 수집은 원문, 날짜/장소 신호, 첨부 media key, 인용 post id만 저장하고 X 상세 API를 자동 호출하지 않는다.
7. 첨부나 인용이 있어 상세 수집이 필요한 후보만 `x_detail_deferred` 근거와 `pending_media_keys`, `pending_quoted_post_ids`를 가진다.
8. 관리자가 해당 후보 카드의 `X 상세 수집` 또는 수집 패널의 `검수 대기 상세 수집`을 누를 때만 `/2/tweets?ids=...` 상세 요청으로 hydrate한다. 이때 media URL, alt text, referenced tweet, author expansion을 가져온다.
9. 상세 수집이 끝나면 `candidate-detail-hydration.ts`가 `x_posts`, `x_media`, `x_post_media`, `x_event_candidates`를 갱신하고 `extraction_payload.x_hydration.status = "hydrated"`로 바꾼다.
10. `note_tweet.text`가 있으면 본문으로 우선 사용한다.
11. 텍스트 또는 첨부 media key가 있는 post만 후보 row가 될 수 있다.
12. 본문에 `일시`, `날짜`, `일정` 중 하나라도 있거나 보조 신호가 3개 이상인 post를 `needs_review`, 나머지는 `ignored`로 저장한다.
13. 일반 증분 수집에서 오늘 이전 일정으로 판정되면 `ignored`와 `past_event_date` 근거를 남긴다.
14. `startDate`/`startTime` 백필 수집은 `since_id`를 우회하지만, 요청 시작 시각이 30일보다 오래됐으면 30일 전으로 잘라서 조회한다.
15. 계정별 timeline 조회가 끝나면 `x_accounts.last_ingested_at`, `last_ingested_post_id`, `last_ingested_post_created_at`, `last_ingest_run_id`를 갱신한다. 신규 계정에 post가 없어도 `last_ingested_at`은 남겨 다음 수집에서 같은 30일 범위를 반복 조회하지 않는다.
16. 백필이나 장기 미수집 계정은 `maxPages` 또는 `X_BACKFILL_TIMELINE_PAGES_PER_ACCOUNT`로 계정별 timeline pagination 상한을 둔다.

## 변경 안전 규칙

- 의제나 지역 옵션을 바꿀 때는 `src/lib/issues.ts`, `src/lib/regions.ts`를 먼저 수정한다. LLM schema는 여기에서 enum을 파생한다.
- 공개 목록 성능을 건드릴 때는 `src/lib/events.ts`, `src/app/page.tsx`, `src/app/api/events/route.ts`, `supabase/schema.sql`을 함께 확인한다.
- 공개 조회 날짜 정책을 바꿀 때는 `src/lib/public-event-date-policy.ts`를 먼저 수정하고 route/hook에 직접 날짜 clamp를 추가하지 않는다.
- 후보 기준을 바꿀 때는 `src/lib/x-ingest/normalize.ts`와 `src/lib/x-ingest/candidate-rows.ts`를 함께 본다.
- 공개 폼 자동 채움은 `publish-defaults.ts`만 먼저 확인한다.
- 구조화 결과 저장 형식을 바꿀 때는 `src/lib/structured-event-storage.ts`와 `docs/llm-maintenance.md`를 함께 갱신한다.
- 사용처가 없는 export, 기본 생성 asset, 오래된 호환 코드는 남기지 않는다.
