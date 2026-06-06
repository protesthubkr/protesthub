"use client";

import { useEffect } from "react";

export function useFilterOverlayLock(isOpen: boolean) {
  useEffect(() => {
    document.documentElement.classList.toggle("filter-open", isOpen);
    document.body.classList.toggle("filter-open", isOpen);

    return () => {
      document.documentElement.classList.remove("filter-open");
      document.body.classList.remove("filter-open");
    };
  }, [isOpen]);
}
