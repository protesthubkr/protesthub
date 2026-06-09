"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  addManualTelegramCandidate,
  type ManualTelegramLinkFormState,
} from "./actions";

const INITIAL_STATE: ManualTelegramLinkFormState = {
  status: "idle",
  message: "",
};

export function ManualTelegramLinkForm({ secret }: { secret: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    addManualTelegramCandidate,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success" && state.targetHref) {
      router.replace(state.targetHref);
      router.refresh();
    }
  }, [router, state.status, state.targetHref]);

  return (
    <section
      className="admin-manual-add-panel"
      aria-labelledby="manual-telegram-link"
    >
      <div>
        <h2 id="manual-telegram-link">텔레그램 링크 수동 추가</h2>
        <p>
          구독 목록에 없는 공개 채널 메시지도 공유 링크로 검수 대기에 올릴 수
          있습니다. 본문을 읽지 못하면 메시지 내용을 직접 붙여넣으세요.
        </p>
      </div>
      <form action={formAction} className="admin-manual-add-form">
        <input name="secret" type="hidden" value={secret} />
        <label htmlFor="manual-telegram-url">메시지 공유 링크</label>
        <div className="admin-manual-add-row">
          <input
            autoComplete="off"
            id="manual-telegram-url"
            name="telegram_url"
            placeholder="https://t.me/channel/1234"
            required
            type="url"
          />
          <ManualTelegramSubmitButton />
        </div>
        <label htmlFor="manual-telegram-text">메시지 본문 선택 입력</label>
        <textarea
          id="manual-telegram-text"
          name="telegram_message_text"
          placeholder="공개 페이지에서 본문을 읽지 못할 때만 붙여넣으세요."
          rows={4}
        />
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

function ManualTelegramSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button disabled={pending} type="submit">
      {pending ? "추가 중" : "후보 추가"}
    </button>
  );
}
