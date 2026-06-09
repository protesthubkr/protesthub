# Statement Feed Roadmap

이 문서는 `/statements` 입장문 피드의 단계별 운영 계획을 정리한다.

## 현재 상태

1차 구현은 코드 기준으로 완료되어 있다.

- 텔레그램 입장문 수집: `/api/ingest/telegram-statements`
- 텔레그램 핵심 문장 추출: `/api/ingest/telegram-statement-extractions`
- 정당 사이트 입장문 수집과 즉시 추출: `/api/ingest/party-statements`
- 공개 피드: `/statements`
- 정당 사이트 1차 source: 국민의힘, 더불어민주당, 개혁신당
- 제외 source: 조국혁신당
- 제외 문건 유형: 일반 `보도자료`
- 정당 사이트 공개 조건: 최근 48시간 안에 서로 다른 텔레그램 출처 2곳 이상이 다룬 confirmed topic에 매칭되거나, 텔레그램 row와 정당 사이트 row의 직접 embedding 유사도가 임계값 이상인 문서만 노출
- 핵심 문장 원칙: 원문에 실제 존재하는 문장만 저장
- OCR 원칙: 사용하지 않음

현재 남은 1차 운영 작업은 Supabase migration 적용과 실제 non-dryRun 검증이다.

## 2차 범위

2차는 기능 확대보다 운영 적용과 품질 확인이 중심이다.

1. Supabase migration을 실제 환경에 적용한다.
   - 필수: `supabase/migrations/20260609170000_telegram_statement_feed.sql`
   - 필수: `supabase/migrations/20260609190000_party_statement_feed.sql`
   - 필수: `supabase/migrations/20260609193000_statement_topic_gate.sql`
   - backfill Batch를 쓸 경우: `supabase/migrations/20260609183000_telegram_statement_extraction_batches.sql`

2. 정당 사이트 수집을 non-dryRun으로 1회 실행한다.
   - `GET /api/ingest/party-statements?limit=3`
   - 국민의힘, 더불어민주당, 개혁신당 각각 저장 여부를 확인한다.
   - `party_statement_documents`, `party_statement_summaries` row를 확인한다.

3. 공개 피드 통합 노출을 확인한다.
   - `/statements`에서 텔레그램 row와 topic gate를 통과한 정당 사이트 row가 최신순으로 함께 보이는지 확인한다.
   - 화면 형식은 `{단체명} - {핵심 문장} {시각}`을 유지한다.

4. Vercel cron 동작을 확인한다.
   - 텔레그램 수집: 매시 정각
   - 텔레그램 추출: 10분 주기 offset
   - 정당 사이트 수집: 1시간 주기
   - `CRON_SECRET`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` 설정을 확인한다.

5. 초기 샘플 품질을 점검한다.
   - 정당 사이트 10-20건을 눈으로 확인한다.
   - 핵심 문장이 제목에 과도하게 쏠리는지 확인한다.
   - 원문에 없는 문장이 저장되지 않는지 확인한다.

6. 실패 row를 원인별로 보정한다.
   - `failed`: parser, fetch, OpenAI, exact-match 실패를 구분한다.
   - `skipped`: 본문 없음, 대상 문건 아님, 추출 문장 없음 여부를 구분한다.
   - 반복 실패는 parser fixture 또는 rule extractor 보정 후보로 기록한다.

7. topic gate를 적용한다.
   - `/api/ingest/statement-topics`가 최근 48시간의 `telegram_statement_summaries.status = extracted` row만 읽는다.
   - embedding cluster 안에 서로 다른 `channel_username`이 2개 이상 있으면 confirmed topic으로 저장한다.
   - 텔레그램끼리 confirmed topic이 없어도 텔레그램 row와 정당 사이트 row가 `STATEMENT_TOPIC_CROSS_SOURCE_THRESHOLD` 이상이면 cross-source topic으로 저장한다.
   - `party_statement_summaries.status = extracted` row는 confirmed topic 또는 cross-source topic과 embedding 매칭될 때 `topic_gate_status = matched`가 된다.
   - 매칭되지 않은 정당 사이트 문서는 `topic_gate_status = unmatched`로 남기고 공개하지 않는다.

### 2차 완료 기준

- `/api/ingest/party-statements?dryRun=true&limit=5`가 세 source 모두 200으로 응답한다.
- `/api/ingest/statement-topics?dryRun=true&limit=100`이 200으로 응답한다.
- non-dryRun 1회 실행 후 confirmed topic에 매칭된 정당 사이트 extracted row만 `/statements`에 보인다.
- 일반 `보도자료`가 저장되지 않는다.
- 조국혁신당 source가 생성되거나 수집되지 않는다.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `git diff --check`가 통과한다.

## 3차 범위

3차는 운영자가 직접 품질을 관리할 수 있는 내부 화면이 중심이다.

1. source 관리 화면
   - 정당 source on/off
   - 텔레그램 요약 피드 대상 채널 관리
   - 마지막 수집 시각 표시
   - 마지막 오류 표시

2. 핵심 문장 수동 보정
   - 잘못 뽑힌 핵심 문장 수정
   - 특정 문서 숨김 처리
   - 수정 전후 이력 저장 여부 결정
   - 정당 사이트 문서를 confirmed topic에 수동 연결
   - 잘못 연결된 정당 사이트 문서를 topic에서 수동 해제
   - 자동 topic 매칭보다 수동 보정을 우선 적용
   - 수동 보정 사유와 보정자를 기록할지 결정

3. 수집 로그와 실패 로그 화면화
   - source별 최근 실행 결과
   - 실패 원인별 count
   - 최근 failed/skipped 문서 목록

4. topic 매칭 검수 화면
   - confirmed topic별 텔레그램 출처 수와 연결 메시지 표시
   - topic에 매칭된 정당 사이트 문서 목록 표시
   - 유사도는 높지만 공개되지 않은 후보 문서 표시
   - 수동 연결, 수동 제외, 재매칭 실행 버튼 제공

### 3차 완료 기준

- 운영자가 코드 수정 없이 source 활성화 상태를 바꿀 수 있다.
- 잘못 추출된 핵심 문장을 수동으로 바로잡을 수 있다.
- 최근 실패 원인을 화면에서 확인할 수 있다.
- 정당 사이트 문서의 topic 연결을 수동으로 추가하거나 해제할 수 있다.

## 4차 범위

4차는 안정화와 과거 데이터 보강이다.

1. parser 안정화
   - 정당 사이트별 HTML fixture 테스트 추가
   - 목록 parser와 상세 parser 최소 회귀 테스트 추가
   - HTML 구조 변경 감지용 실패 메시지 정리

2. backfill
   - 최근 48시간 백필은 `/api/ingest/statement-backfill?windowHours=48`을 사용한다.
   - 기본은 `dryRun=true`이며 실제 저장은 `dryRun=false`를 명시한다.
   - 텔레그램 백필은 기존 준실시간 cursor를 변경하지 않는다.
   - 최근 7일 또는 30일 정당 성명/논평 일괄 수집
   - OpenAI Batch로 애매한 문서 추출 비용 절감
   - backfill 결과의 중복 저장 방지 확인

3. 공개 피드 개선
   - source 필터
   - 단체/정당별 보기
   - 문서 유형 표시 여부 결정
   - 모바일에서 긴 핵심 문장 표시 품질 확인

### 4차 완료 기준

- 주요 parser는 fixture 기반 회귀 테스트를 가진다.
- backfill을 실행해도 중복 row가 생기지 않는다.
- 공개 피드에서 source별 탐색이 가능하다.

## 계속 제외할 것

다음 항목은 별도 결정 전까지 구현 범위에서 제외한다.

- OCR
- 일반 `보도자료`
- 조국혁신당 source
- 원문에 없는 생성 요약문
- 기존 수동 텔레그램 수집 cursor 변경

## 운영 원칙

- 공개 피드에는 `status = extracted` row만 노출한다.
- `status = extracted` row라도 품질 게이트가 링크, 안내문, 직책 소개, 낮은 confidence로 판단하면 공개/매칭에서 제외한다.
- 정당 사이트 row는 `topic_gate_status = matched` 또는 `manual_matched`일 때만 공개한다.
- 핵심 문장은 반드시 저장 원문에 포함된 문자열이어야 한다.
- 원문 전체 exact-match 검증을 통과하지 못하면 공개하지 않는다.
- 정당 사이트 HTML parser는 사이트별로 유지한다.
- 작은 주기 변경이나 source 추가도 dryRun을 먼저 통과시킨다.
