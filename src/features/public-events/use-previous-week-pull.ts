"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PullLoadState = {
  isReady: boolean;
};

type UsePreviousWeekPullProps = {
  enabled: boolean;
  isLoading: boolean;
  onLoadPrevious: () => void | Promise<void>;
};

const PULL_LOAD_THRESHOLD_PX = 72;
const PULL_LOAD_EDGE_TOLERANCE_PX = 2;

export function usePreviousWeekPull({
  enabled,
  isLoading,
  onLoadPrevious,
}: UsePreviousWeekPullProps) {
  const pullLoadStateRef = useRef<PullLoadState | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const [pullLoadState, setPullLoadState] = useState<PullLoadState | null>(
    null,
  );

  const updatePullLoadState = useCallback((nextState: PullLoadState | null) => {
    const currentState = pullLoadStateRef.current;

    if (isSamePullLoadState(currentState, nextState)) {
      return;
    }

    pullLoadStateRef.current = nextState;
    setPullLoadState(nextState);
  }, []);

  const resetPullState = useCallback(() => {
    pullStartYRef.current = null;
    updatePullLoadState(null);
  }, [updatePullLoadState]);

  useEffect(() => {
    if (!enabled || isLoading) {
      resetPullState();
    }
  }, [enabled, isLoading, resetPullState]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1 || isLoading) {
        resetPullState();
        return;
      }

      const y = event.touches[0]?.clientY;

      if (typeof y !== "number") {
        resetPullState();
        return;
      }

      pullStartYRef.current = isAtPageTop() ? y : null;
      updatePullLoadState(null);
    }

    function handleTouchMove(event: TouchEvent) {
      const pullStartY = pullStartYRef.current;

      if (pullStartY === null || event.touches.length !== 1) {
        return;
      }

      const y = event.touches[0]?.clientY;

      if (typeof y !== "number") {
        resetPullState();
        return;
      }

      const rawDistance = y - pullStartY;

      if (rawDistance <= 0) {
        updatePullLoadState(null);
        return;
      }

      updatePullLoadState({
        isReady: rawDistance >= PULL_LOAD_THRESHOLD_PX,
      });
    }

    function handleTouchEnd() {
      const shouldLoad = pullLoadStateRef.current?.isReady;

      resetPullState();

      if (shouldLoad) {
        void onLoadPrevious();
      }
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", resetPullState, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", resetPullState);
    };
  }, [
    enabled,
    isLoading,
    onLoadPrevious,
    resetPullState,
    updatePullLoadState,
  ]);

  return pullLoadState;
}

function isAtPageTop() {
  return window.scrollY <= PULL_LOAD_EDGE_TOLERANCE_PX;
}

function isSamePullLoadState(
  currentState: PullLoadState | null,
  nextState: PullLoadState | null,
) {
  if (!currentState || !nextState) {
    return currentState === nextState;
  }

  return currentState.isReady === nextState.isReady;
}
