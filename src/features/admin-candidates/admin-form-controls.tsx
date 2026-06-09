"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { AdminActionState } from "./action-states";

export function AdminSubmitButton({
  children,
  disabled,
  variant = "primary",
}: {
  children: ReactNode;
  disabled?: boolean;
  variant?: "dark" | "primary";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={variant === "dark" ? "admin-button-dark" : undefined}
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "실행 중" : children}
    </button>
  );
}

export function AdminActionMessage({ state }: { state: AdminActionState }) {
  if (!state.message) {
    return null;
  }

  return (
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
  );
}
