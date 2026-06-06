"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  runXIngestFromAdmin,
  type XIngestControlState,
} from "./actions";

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
        <h2 id="x-ingest-control">X 수집 실행</h2>
        <p>
          평소에는 저장된 계정 목록으로 수집하고, 팔로잉을 바꾼 날에만 목록
          갱신을 실행합니다.
        </p>
      </div>
      <form action={formAction} className="admin-ingest-control-form">
        <input name="secret" type="hidden" value={secret} />
        <div className="admin-ingest-control-actions">
          <IngestSubmitButton
            name="mode"
            value="stored_accounts"
          >
            일반 수집
          </IngestSubmitButton>
          <IngestSubmitButton
            name="mode"
            value="refresh_following"
          >
            팔로잉 갱신 후 수집
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
      {pending ? "수집 중" : children}
    </button>
  );
}
