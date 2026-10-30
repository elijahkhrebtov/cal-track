"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { request } from "@/components/api";
import { ErrorNotice } from "@/components/forms";
import { FoodListSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import type { Food, FoodSearchPage } from "@/lib/types";

export function useFoodPages(
  kind: "local" | "external" | "custom",
  query: string,
  enabled = true,
) {
  const result = useInfiniteQuery({
    queryKey: ["foods", kind, query],
    initialPageParam: 1,
    queryFn: ({ signal, pageParam }) => {
      const params = new URLSearchParams({ q: query, page: String(pageParam) });
      if (kind === "custom") params.set("custom", "true");
      const path = kind === "external" ? "/api/foods/search" : "/api/foods";
      return request<FoodSearchPage>(`${path}?${params}`, { signal });
    },
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled,
    staleTime: kind === "external" ? 7 * 24 * 60 * 60_000 : 30_000,
    gcTime: kind === "external" ? 24 * 60 * 60_000 : 5 * 60_000,
    refetchOnWindowFocus: kind !== "external",
  });
  const { fetchNextPage } = result;
  const loadMore = useCallback(
    () => fetchNextPage({ cancelRefetch: false }),
    [fetchNextPage],
  );
  return { ...result, loadMore };
}

export function foodKey(food: Food) {
  return food.source === "custom"
    ? food.id
    : `${food.source}:${food.externalId}`;
}

export function foodPages(pages: FoodSearchPage[] | undefined): Food[] {
  const unique = new Map<string, Food>();
  for (const page of pages ?? []) {
    for (const food of page.foods) {
      const key = foodKey(food);
      if (!unique.has(key)) unique.set(key, food);
    }
  }
  return [...unique.values()];
}

export function FoodPageLoader({
  root,
  hasMore,
  loading,
  refreshing,
  error,
  onLoad,
  label,
}: {
  root: RefObject<HTMLDivElement | null>;
  hasMore: boolean;
  loading: boolean;
  refreshing: boolean;
  error: unknown;
  onLoad: () => unknown;
  label: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || loading || refreshing || error || !sentinel.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void onLoad();
      },
      { root: root.current, rootMargin: "160px 0px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, loading, refreshing, error, onLoad, root]);

  if (!hasMore && !loading && !error) return null;
  return (
    <div ref={sentinel} className="food-page-loader">
      {loading ? (
        <FoodListSkeleton label={`Loading more ${label}`} />
      ) : (
        <>
          <ErrorNotice error={error} />
          <Button
            variant="ghost"
            disabled={refreshing}
            onClick={() => void onLoad()}
          >
            {error ? `Retry loading ${label}` : `Load more ${label}`}
          </Button>
        </>
      )}
    </div>
  );
}
