"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { XIngestControlState } from "./action-states";
import { runXIngestFromAdmin } from "./x-ingest-actions";

const INITIAL_STATE: XIngestControlState = {
  status: "idle",
  message: "",
};

export function XIngestControlPanel({ secret }: { secret: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    runXIngestFromAdmin,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <section
      className="admin-manual-add-panel admin-ingest-control-panel"
      aria-labelledby="x-ingest-control"
    >
      <div>
        <h2 id="x-ingest-control">X 수집 제어</h2>
        <p>
          기본 수집은 저장된 계정 목록만 사용합니다. 이미지 URL, 인용 포스트,
          작성자 상세 정보는 검수 후보가 된 뒤 필요한 경우에만 수집합니다.
        </p>
      </div>
      <form action={formAction} className="admin-ingest-control-form">
        <input name="secret" type="hidden" value={secret} />
        <div className="admin-ingest-control-actions">
          <IngestSubmitButton name="mode" value="stored_accounts">
            저비용 수집
          </IngestSubmitButton>
          <IngestSubmitButton name="mode" value="refresh_following">
            팔로잉 갱신 후 수집
          </IngestSubmitButton>
          <IngestSubmitButton name="mode" value="hydrate_pending">
            검수 대기 상세 수집
          </IngestSubmitButton>
          <IngestSubmitButton name="mode" value="preview_ignored_promotion">
            ignored 승격 미리보기
          </IngestSubmitButton>
          <IngestSubmitButton name="mode" value="promote_ignored">
            ignored 승격 적용
          </IngestSubmitButton>
        </div>
        <p
          aria-live="polite"
          className={
            state.status === "error"
              ? "admin-manual-add-message is-error"
              : "admin-manual-add-message"
          }
        >
          {state.message}
        </p>
      </form>
    </section>
  );
}

function IngestSubmitButton({
  children,
  name,
  value,
}: {
  children: ReactNode;
  name: string;
  value: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button disabled={pending} name={name} type="submit" value={value}>
      {pending ? "실행 중" : children}
    </button>
  );
}
