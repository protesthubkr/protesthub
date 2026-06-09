"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ManualXPostFormState } from "./action-states";
import { addManualXPostCandidate } from "./manual-candidate-actions";

const INITIAL_STATE: ManualXPostFormState = {
  status: "idle",
  message: "",
};

export function ManualXPostForm({ secret }: { secret: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    addManualXPostCandidate,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success" && state.targetHref) {
      router.replace(state.targetHref);
      router.refresh();
    }
  }, [router, state.status, state.targetHref]);

  return (
    <section className="admin-manual-add-panel" aria-labelledby="manual-x-post">
      <div>
        <h2 id="manual-x-post">X 포스트 수동 추가</h2>
        <p>필요한 포스트 1건만 가져와 검수 대기에 올립니다.</p>
      </div>
      <form action={formAction} className="admin-manual-add-form">
        <input name="secret" type="hidden" value={secret} />
        <label htmlFor="manual-x-post-url">포스트 URL 또는 ID</label>
        <div className="admin-manual-add-row">
          <input
            autoComplete="off"
            id="manual-x-post-url"
            name="x_post_url"
            placeholder="https://x.com/account/status/... 또는 포스트 ID"
            required
            type="text"
          />
          <ManualSubmitButton />
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

function ManualSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button disabled={pending} type="submit">
      {pending ? "추가 중" : "후보 추가"}
    </button>
  );
}
