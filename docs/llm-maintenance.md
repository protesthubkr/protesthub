# LLM Maintenance Guide

이 문서는 LLM 에이전트가 ProtestHub를 수정할 때 참고해야 할 작업 절차와 금지선을 정리한다.

## 먼저 읽을 파일

1. `docs/architecture.md`
2. UI/UX를 건드리면 `docs/ui-principles.md`
3. 요청과 직접 관련된 `src/features/*` 폴더
4. 관련 `src/lib/*` 도메인 파일
5. DB 조회나 저장을 건드리면 `supabase/schema.sql`

## 작업별 진입점

| 작업 | 먼저 볼 파일 |
| --- | --- |
| 공개 목록 초기 로드 | `src/app/page.tsx`, `src/features/public-events/home-page-data.ts`, `src/lib/events.ts` |
| 공개 조회 날짜 정책 | `src/lib/public-event-date-policy.ts`, `src/lib/date-key.ts`, `src/features/public-events/home-page-data.ts` |
| 공개 목록 추가 로드 | `src/features/public-events/use-event-list-window.ts`, `src/features/public-events/use-previous-week-pull.ts`, `src/app/api/events/route.ts`, `src/lib/events.ts`, `src/lib/event-query-model.ts` |
| 캘린더 월 조회 | `src/features/public-events/use-calendar-month-data.ts`, `src/app/api/events/calendar/route.ts`, `src/lib/events.ts`, `src/lib/event-query-model.ts`, `src/lib/public-event-date-policy.ts` |
| 리스트/캘린더 전환 | `src/features/public-events/home-page-client.tsx`, `view-mode-switch.tsx`, `filters.ts` |
| 필터 동작 | `src/features/public-events/filters.ts`, `use-home-filter-state.ts` |
| 날짜/시간 목록 표시 | `src/features/public-events/event-list-model.ts`, `event-timeline.tsx` |
| 월 캘린더 표시 | `src/features/public-events/calendar-month-model.ts`, `calendar-month-view.tsx` |
| 목록 카드 | `src/features/public-events/event-card.tsx` |
| 상세 페이지 | `src/app/events/[id]/page.tsx`, `event-detail-client.tsx` |
| UI 원칙/시각 위계 | `docs/ui-principles.md`, `src/app/globals.css` |
| 검수 카드 | `src/features/admin-candidates/candidate-card.tsx`, `candidate-action-forms.tsx`, `structured-event-summary.tsx`, `detail-hydration-action.tsx` |
| 공개 폼 기본값 | `src/features/admin-candidates/publish-defaults.ts` |
| 검수 서버 액션 | `src/features/admin-candidates/actions.ts`, `action-form-data.ts` |
| 공개/비공개 저장 | `src/features/admin-candidates/candidate-publication.ts`, `actions.ts` |
| 검수 OCR 실행 | `src/features/admin-candidates/candidate-ocr.ts`, `actions.ts` |
| X 수집 흐름 | `src/lib/x-ingest/run.ts`, `src/lib/x-ingest/candidate-detail-hydration.ts`, `repository.ts` |
| X 후보 분류 | `src/lib/x-ingest/normalize.ts`, `candidate-rows.ts`, `hydration-state.ts` |
| LLM 프롬프트 | `src/lib/llm/structured-event-prompt.ts` |
| LLM JSON schema | `src/lib/llm/structured-event-schema.ts` |
| LLM 모델/env 설정 | `src/lib/llm/structured-event-config.ts` |
| LLM 응답 파싱/보정 | `src/lib/llm/structured-event-output.ts` |
| LLM 결과 저장 | `src/lib/structured-event-storage.ts` |

## 공개 목록 성능 원칙

- 공개 목록은 `EventListOccurrence`만 사용한다. `PublicEvent`를 목록 카드나 목록 API에 넘기지 않는다.
- 첫 화면은 오늘부터 1주일만 조회한다.
- 바닥 도달 시 `/api/events`로 다음 1주일만 조회한다.
- 미래 날짜에서 시작한 리스트는 pull-to-load로 이전 1주일을 붙일 수 있지만, 오늘 이전 데이터는 공개 조회하지 않는다.
- 캘린더 뷰는 `/api/events/calendar`로 월별 요약만 조회한다. 장소 상세, 출처 URL, 포스터는 싣지 않는다.
- 캘린더 뷰 payload도 오늘 이전 occurrence를 제외한다. 과거 월 query는 오늘이 속한 월로 보정한다.
- 날짜 범위, 의제, 지역, 주최 필터는 서버 조회에서 적용한다.
- 클라이언트에서 전체 이벤트 배열을 받은 뒤 필터링하거나 날짜 window를 계산하는 구조로 되돌리지 않는다.
- organizer 옵션은 별도 가벼운 조회로 가져온다.
- 상세 페이지는 `getEventById(id)` 단건 조회만 사용한다.
- 운영 DB에는 `get_public_event_occurrence_window()` RPC, `public_event_occurrences` view, 관련 index가 적용되어야 한다. DB 객체가 없으면 fallback 없이 조회 실패로 드러나야 한다.

## Next.js/Vercel 캐시 원칙

- `/`와 `/events/[id]`는 `revalidate = 60`을 사용한다.
- `/api/events`는 `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`을 사용한다.
- 공개 처리 서버 액션은 `/`, `/events/[id]`, `/admin/candidates`를 revalidate한다.
- 관리자/수집 경로는 신선도가 중요하므로 공개 목록처럼 CDN 캐시하지 않는다.
- DB client와 외부 SDK client는 module scope에서 즉시 만들지 않는다. 반드시 lazy getter 안에서 만든다.

## 리팩터링 원칙

- 새 책임이 생기면 route 파일에 넣지 말고 가까운 feature/lib 파일로 이동한다.
- UI 텍스트와 도메인 규칙을 같은 함수에 섞지 않는다.
- 공개 조회 날짜 정책은 `public-event-date-policy.ts`에 둔다. route, API, hook에 `today` clamp 로직을 직접 복제하지 않는다.
- 한국 시간대 date key 계산은 `date-key.ts`를 사용한다. 수집 과거 일정 판정과 공개 조회 날짜 보정이 서로 다른 시간대 계산을 갖지 않게 한다.
- DB row 생성과 DB 저장을 분리한다. row 생성은 순수 함수, 저장은 repository/서버 액션에 둔다.
- X 상세 수집 가능 여부, 첨부 키 병합, hydrate 사유 판정은 `hydration-state.ts`에 둔다.
- 공개 조회 row 변환, empty window 생성, 캘린더 요약은 `src/lib/event-query-model.ts`에 둔다.
- OpenAI 호출, prompt, schema, 모델/env 설정, 응답 파싱, 저장 포맷을 한 파일에 합치지 않는다.
- `src/app` route는 가능한 한 import와 prop 전달만 남긴다.
- `server-only` 성격의 모듈은 클라이언트 컴포넌트에서 import하지 않는다.
- 검수 화면 서버 액션은 흐름 orchestration만 맡기고, FormData 파싱은 `action-form-data.ts`, 공개/비공개 저장 규칙은 `candidate-publication.ts`, OCR update 생성은 `candidate-ocr.ts`에 둔다.
- 사용처 없는 export, 오래된 호환 wrapper, 기본 scaffold asset은 제거한다.

## 변경 절차

1. `rg`로 실제 사용처를 먼저 찾는다.
2. 변경하려는 파일이 속한 계층의 기존 패턴을 확인한다.
3. 도메인 계산은 순수 함수로 먼저 분리한다.
4. UI 컴포넌트 props는 목록용/상세용 데이터 계약을 좁게 유지한다.
5. 서버 액션은 `FormData` 파싱, 권한 확인, 도메인 호출, revalidate/redirect 순서로 둔다.
6. DB 조회 구조를 바꾸면 `supabase/schema.sql`과 문서를 함께 갱신한다.
7. 문서와 코드 구조가 달라지면 문서를 같이 수정한다.

## 검증 체크리스트

기본 검증:

```powershell
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

프론트엔드 변경:

- 모바일 `390x844`에서 `/`를 연다.
- 조건 칩, 필터 버튼, 필터 패널, 전체 선택/해제, 적용 후 query 반영을 확인한다.
- 목록 하단에서 다음 1주일이 추가 로드되는지 확인한다.
- 필터 버튼이 목록을 가리지 않는지 확인한다.
- `/events/[id]`에서 상세 정보, 포스터, 원본 링크를 확인한다.

검수/수집 변경:

- `/admin/candidates?secret=...`에서 후보 카드가 렌더링되는지 확인한다.
- OCR/구조화 버튼은 실제 API 비용이 발생하므로 필요한 경우에만 누른다.
- 공개 폼 기본값은 기존 공개 이벤트가 있는 후보와 없는 후보를 각각 확인한다.
- `/api/ingest/x`는 Bearer secret과 함께 테스트한다. 백필은 `startDate=YYYY-MM-DD` 또는 `startTime=...` query로 실행하되, 실제 조회 시작점은 최대 30일 전으로 제한된다.
- 구조화 추출은 상세설명과 evidence를 생성하지 않는다. 기본 출력 예산은 `OPENAI_EXTRACTION_MAX_OUTPUT_TOKENS=2000` 수준으로 두고, GPT-5 계열 reasoning token 비용을 줄이기 위해 `OPENAI_EXTRACTION_REASONING_EFFORT=minimal`을 사용한다.
- 구조화 프롬프트는 긴 원문과 OCR을 그대로 모두 넣지 않고 앞부분 중심으로 압축하되, 끝부분 일부를 보존한다. 입력 길이 정책을 바꿀 때는 `src/lib/llm/structured-event-prompt.ts`를 먼저 확인한다.

## 주의해야 할 불변 조건

- 빈 필터 배열은 전체 선택으로 해석한다.
- `structured_event`는 schema v3 형태만 저장하며, 별도 상세설명 필드는 두지 않는다.
- 일반 `/api/ingest/x` 수집은 팔로잉 목록 API를 호출하지 않고 `x_accounts`의 캐시된 계정만 사용한다.
- 팔로잉 목록을 새로 반영할 때는 `/admin/candidates`의 X 수집 실행 패널을 우선 사용하고, API 직접 실행이 필요할 때만 `/api/ingest/x?refreshFollowing=true`를 쓴다.
- timeline 1차 요청에는 `expansions`, `media.fields`, `user.fields`를 붙이지 않는다.
- 기본 X 수집은 `hydrateMode=deferred`로 동작한다. 검수 후보로 판정되어도 상세 요청을 자동 실행하지 않는다.
- X 후보는 텍스트 또는 첨부 media key가 있는 post만 만든다.
- 첨부나 인용이 있어 상세 수집이 필요한 후보만 `x_detail_deferred` 근거를 가진다.
- media URL, alt text, referenced tweet, author expansion은 해당 후보 카드의 `X 상세 수집` 또는 수집 패널의 `검수 대기 상세 수집`을 눌렀을 때만 hydrate한다.
- 상세 수집 로직은 `src/lib/x-ingest/candidate-detail-hydration.ts`에만 둔다. 다시 `run.ts`에 자동 hydrate를 넣지 않는다.
- 검수 대기는 본문에 `일시`, `날짜`, `일정` 중 하나라도 있거나 보조 신호가 3개 이상인 post에 해당한다.
- 일반 X 수집은 `x_accounts`의 계정별 수집 커서를 사용한다.
- 커서가 없는 신규 계정이나 오래된 커서는 최대 30일 전까지만 조회한다.
- 일반 증분 수집에서 오늘 이전 집회 안내는 `ignored`로 보낸다.
- `startDate`/`startTime` 백필 수집에서는 과거 일정 판정이 있어도 검수 키워드 post를 검수 대기로 유지하되, 30일보다 오래된 데이터는 조회하지 않는다.
- `note_tweet.text`가 있으면 X 본문으로 우선 사용한다.
