"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PullLoadState = {
  isReady: boolean;
  progress: number;
};

type UsePreviousWeekPullProps = {
  enabled: boolean;
  isLoading: boolean;
  onLoadPrevious: () => void | Promise<void>;
};

type PullStartPoint = {
  x: number;
  y: number;
};

const PULL_LOAD_THRESHOLD_PX = 72;
const PULL_LOAD_EDGE_TOLERANCE_PX = 2;

export function usePreviousWeekPull({
  enabled,
  isLoading,
  onLoadPrevious,
}: UsePreviousWeekPullProps) {
  const pullLoadStateRef = useRef<PullLoadState | null>(null);
  const pullStartRef = useRef<PullStartPoint | null>(null);
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
    pullStartRef.current = null;
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

      const touch = event.touches[0];
      const x = touch?.clientX;
      const y = touch?.clientY;

      if (typeof x !== "number" || typeof y !== "number") {
        resetPullState();
        return;
      }

      pullStartRef.current = isAtPageTop() ? { x, y } : null;
      updatePullLoadState(null);
    }

    function handleTouchMove(event: TouchEvent) {
      const pullStart = pullStartRef.current;

      if (pullStart === null || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const x = touch?.clientX;
      const y = touch?.clientY;

      if (typeof x !== "number" || typeof y !== "number") {
        resetPullState();
        return;
      }

      const horizontalDistance = Math.abs(x - pullStart.x);
      const rawDistance = y - pullStart.y;

      if (rawDistance <= 0) {
        updatePullLoadState(null);
        return;
      }

      if (horizontalDistance > rawDistance) {
        resetPullState();
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      updatePullLoadState({
        isReady: rawDistance >= PULL_LOAD_THRESHOLD_PX,
        progress: getPullProgress(rawDistance),
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
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
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

  return (
    currentState.isReady === nextState.isReady &&
    currentState.progress === nextState.progress
  );
}

function getPullProgress(distance: number) {
  return Math.min(1, Math.round((distance / PULL_LOAD_THRESHOLD_PX) * 100) / 100);
}
