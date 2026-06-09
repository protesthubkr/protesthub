# protesthub

Next.js, Vercel, Supabase 기반 시위/집회 정보 모아보기 MVP입니다.

현재 구현 범위:

- 모바일 중심 결과 목록
- 우측 하단 필터 CTA와 하단 슬라이드 필터 패널
- 의제, 광역자치단체, 주최 단체 선택
- 오늘부터 1주일씩 결과 로드, 하단 도달 시 다음 1주일 자동 추가
- 서울, 부산, 대구, 인천, 광주, 대전, 울산, 세종, 경기, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주 지역 버튼 2열 표시
- URL query 기반 필터 상태
- 상세 페이지
- 포스터 확대 모달
- 취소됨 상세 페이지
- Supabase 공개 조회와 내부 검수 DB 연결
- X raw 수집 파이프라인 스파이크
- X 후보 내부 검수 화면

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Supabase를 연결하려면 `.env.example`을 참고해 환경변수를 채운 뒤 `supabase/schema.sql`을 적용하세요.

## X ingest

X 기반 수집을 실행하려면 `supabase/schema.sql`을 적용하고 `.env.example`의 수집 환경변수를 채우세요.

필수값:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `X_BEARER_TOKEN`
- `X_OPERATING_USER_ID`
- `INGEST_SECRET`

선택값:

- `X_POSTS_PER_ACCOUNT`: 계정별로 한 번에 가져올 최대 포스트 수, 기본 10
- `X_MAX_FOLLOWING_ACCOUNTS`: 팔로잉 계정 조회 상한, 기본 100
- `X_INCLUDE_REPLIES`: replies 수집 여부, 기본 `false`
- `X_API_MAX_RETRIES`: X API 429/5xx 응답 재시도 횟수, 기본 2
- `X_API_RETRY_BASE_DELAY_MS`: X API 재시도 기본 대기 시간(ms), 기본 1000
- `OPENAI_API_KEY`: 검수 화면의 포스터 OCR 실행용
- `OPENAI_OCR_MODEL`: OCR에 사용할 OpenAI 모델, 기본 `gpt-5-mini`
- `OPENAI_OCR_IMAGE_DETAIL`: 이미지 입력 세부 수준, 기본 `high`
- `OPENAI_EXTRACTION_MODEL`: 집회 후보 구조화 추출 모델, 기본 `gpt-5-nano`
- `OPENAI_EXTRACTION_FALLBACK_MODEL`: 구조화 결과가 낮은 신뢰도이거나 핵심 필드가 빠졌을 때 한 번 재시도할 모델, 기본 `gpt-5-mini`

수동 실행:

```bash
curl -X POST http://localhost:3000/api/ingest/x \
  -H "Authorization: Bearer $INGEST_SECRET"
```

수집 결과는 `x_ingest_runs`, `x_accounts`, `x_posts`, `x_media`, `x_event_candidates`에 저장됩니다. X 원문은 `note_tweet.text`가 있으면 일반 `text`보다 우선 저장합니다. 수집 이력이 있는 계정은 계정별 최신 저장 포스트 이후(`since_id`)만 가져오고, 저장 포스트가 없는 계정은 직전 성공 수집 시작 시각 이후(`start_time`)만 가져옵니다. 직전 성공 수집 기록이 없는 최초 실행에서만 최신 포스트 묶음으로 bootstrap합니다. 후보는 관리자 검수 전 공개 목록에 노출되지 않습니다. 후보 생성은 본문 또는 미디어가 있는 수집 포스트를 대상으로 하며, 본문에 `일시`와 `장소`가 모두 포함된 경우에만 `needs_review`로 보내고 나머지는 `ignored`로 분류합니다. 본문 또는 OCR 텍스트의 일정 날짜가 모두 한국시간 오늘 이전이면 `ignored`로 자동 제외합니다. `OPENAI_API_KEY`가 있으면 검수 카드에서 포스터 OCR을 실행하고, 본문/OCR 텍스트를 집회명, 날짜, 장소, 주최, 의제 태그, 형식으로 구조화해 `extraction_payload.structured_event`에 저장할 수 있습니다.

내부 검수 화면:

```text
http://localhost:3000/admin/candidates?secret=INGEST_SECRET
```

## Telegram statement feed

Run the statement feed collector with `GET /api/ingest/telegram-statements`.
The route is protected by Bearer `CRON_SECRET`, and `vercel.json` schedules it
hourly on the hour.

```bash
curl "http://localhost:3000/api/ingest/telegram-statements?dryRun=true" \
  -H "Authorization: Bearer $CRON_SECRET"
```

The collector reads active `telegram_channel_subscriptions` rows with
`statement_feed_enabled = true`. It keeps a separate cursor in
`telegram_statement_scan_states`, so it does not mutate the manual Telegram
candidate scan cursor. OCR is not used; only Telegram message body text can
create `telegram_statement_summaries.status = pending` rows.

Pending rows are processed by `GET /api/ingest/telegram-statement-extractions`.
The extractor first tries a conservative local rule extractor. If no clear
source sentence is found, it calls OpenAI to choose one exact source sentence.
Only rows where the chosen sentence is found in the full original Telegram text
are published. Extracted rows are visible at `/statements`.

For large backfills, create a discounted OpenAI Batch job with:

```bash
curl -X POST "http://localhost:3000/api/ingest/telegram-statement-extraction-batches?limit=200" \
  -H "Authorization: Bearer $CRON_SECRET"
```

When the returned `openaiBatchId` is complete, sync and import results with:

```bash
curl "http://localhost:3000/api/ingest/telegram-statement-extraction-batches?batchId=$OPENAI_BATCH_ID&importResults=true" \
  -H "Authorization: Bearer $CRON_SECRET"
```

`OPENAI_STATEMENT_EXTRACTION_INPUT_CHARS` limits the Telegram text sent to the
model, while exact-match validation still uses the full stored source text.
`OPENAI_STATEMENT_PROMPT_CACHE_KEY` keeps repeated extraction prompts cache
friendly.

Party statement pages are collected with `GET /api/ingest/party-statements`.
This route is also protected by Bearer `CRON_SECRET`, and `vercel.json`
schedules it hourly. The first implementation includes 국민의힘, 더불어민주당,
and 개혁신당. 조국혁신당 is excluded, and plain `보도자료` rows are excluded.
Party rows are only shown publicly after `/api/ingest/statement-topics` matches
them to a topic signal. A topic can be confirmed either by extracted Telegram
statements from at least two different channels, or by a direct Telegram-party
embedding match above `STATEMENT_TOPIC_CROSS_SOURCE_THRESHOLD`.

```bash
curl "http://localhost:3000/api/ingest/party-statements?dryRun=true&limit=5" \
  -H "Authorization: Bearer $CRON_SECRET"
```

```bash
curl "http://localhost:3000/api/ingest/statement-topics?dryRun=true&limit=100" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Recent statement backfills can be orchestrated with one dry-run-first route:

```bash
curl "http://localhost:3000/api/ingest/statement-backfill?windowHours=48&dryRun=true&maxPages=60&extractionLimit=200&extractionPasses=5&partyLimit=200&topicLimit=500" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Use `dryRun=false` to write rows. Telegram backfill scans ignore the statement
cursor and do not update `telegram_statement_scan_states`, so the 10-minute
near-realtime scanner keeps its current position.

Recent extracted statement rows can be rechecked with the quality gate. The
route defaults to `dryRun=true`; use `source=telegram`, `source=party`, or
`source=all`.

```bash
curl "http://localhost:3000/api/ingest/statement-quality-review?windowHours=48&source=all&dryRun=true&limit=500" \
  -H "Authorization: Bearer $CRON_SECRET"
```

핵심 기획 문서는 상위 `docs/` 디렉터리에 있습니다.

## Architecture and maintenance

구현 구조와 LLM 유지보수 절차는 아래 문서를 먼저 확인하세요.

- `docs/architecture.md`: route, feature, lib 계층과 데이터 흐름
- `docs/llm-maintenance.md`: LLM 에이전트용 작업 절차, 검증 체크리스트, 불변 조건
- `docs/statement-feed-roadmap.md`: 입장문 피드 2차 이후 운영/기능 로드맵
