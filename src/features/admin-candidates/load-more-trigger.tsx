"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type AdminCandidatesLoadMoreProps = {
  hasMoreCandidates: boolean;
  loadedCount: number;
  nextHref: string | null;
};

export function AdminCandidatesLoadMore({
  hasMoreCandidates,
  loadedCount,
  nextHref,
}: AdminCandidatesLoadMoreProps) {
  const router = useRouter();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [loadingHref, setLoadingHref] = useState<string | null>(null);
  const isLoading = Boolean(nextHref && loadingHref === nextHref);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMoreCandidates || !nextHref || isLoading) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoadingHref(nextHref);
          router.replace(nextHref, { scroll: false });
        }
      },
      { rootMargin: "720px 0px" },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMoreCandidates, isLoading, nextHref, router]);

  return (
    <div
      aria-live="polite"
      className="admin-load-more-sentinel"
      ref={sentinelRef}
    >
      {hasMoreCandidates && nextHref ? (
        <a href={nextHref}>{isLoading ? "더 불러오는 중" : "더 보기"}</a>
      ) : (
        <span>{loadedCount}개 후보를 모두 불러왔습니다</span>
      )}
    </div>
  );
}
