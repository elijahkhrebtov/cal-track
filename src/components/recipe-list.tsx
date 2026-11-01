"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Check, ChevronRight, LoaderCircle, Plus } from "lucide-react";
import { request } from "@/components/api";
import { ErrorNotice } from "@/components/forms";
import { FoodPageLoader } from "@/components/food-pagination";
import { FoodListSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { navigate } from "@/components/workflow-page";
import type { Recipe, RecipeSearchPage } from "@/lib/types";

export function LibraryTabs({ recipes = false }: { recipes?: boolean }) {
  const tabs = [
    { label: "Custom foods", path: "/custom-foods" },
    { label: "Recipes", path: "/custom-foods/recipes" },
  ];
  return (
    <div className="food-search-tabs" role="tablist" aria-label="Library">
      {tabs.map((tab, index) => (
        <button
          key={tab.path}
          type="button"
          role="tab"
          id={index === 1 ? "library-recipes-tab" : "library-foods-tab"}
          aria-controls={
            index === 1 ? "recipe-results-panel" : "library-foods-panel"
          }
          aria-selected={recipes === (index === 1)}
          tabIndex={recipes === (index === 1) ? 0 : -1}
          onClick={() => navigate(tab.path)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
            navigate(tabs[next].path);
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>(
                  '[aria-label="Library"] [aria-selected="true"]',
                )
                ?.focus(),
            );
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function RecipeResults({
  query,
  onQuickAdd,
}: {
  query: string;
  onQuickAdd?: (recipe: Recipe) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    if (root.current) root.current.scrollTop = 0;
  }, [query]);
  const result = useInfiniteQuery({
    queryKey: ["recipes", "list", debounced],
    initialPageParam: 1,
    queryFn: ({ signal, pageParam }) =>
      request<RecipeSearchPage>(
        `/api/recipes?${new URLSearchParams({ q: debounced, page: String(pageParam) })}`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextPage ?? undefined,
    staleTime: 30_000,
  });
  const { fetchNextPage } = result;
  const loadMore = useCallback(
    () => fetchNextPage({ cancelRefetch: false }),
    [fetchNextPage],
  );
  const current = debounced === query;
  const loading = !current || result.isPending;
  const recipes = [
    ...new Map(
      result.data?.pages
        .flatMap((page) => page.recipes)
        .map((recipe) => [recipe.id, recipe]),
    ).values(),
  ];
  const [added, setAdded] = useState<{
    id: string;
    name: string;
    count: number;
  } | null>(null);
  useEffect(() => {
    if (!added) return;
    const timeout = setTimeout(() => setAdded(null), 1600);
    return () => clearTimeout(timeout);
  }, [added]);
  return (
    <div
      ref={root}
      className="food-results-scroll"
      aria-label="Recipe results"
      role="tabpanel"
      id="recipe-results-panel"
      aria-labelledby={onQuickAdd ? "food-tab-recipes" : "library-recipes-tab"}
      tabIndex={0}
    >
      <span className="sr-only" role="status" aria-atomic="true">
        {added && <span key={added.count}>Added {added.name} to meal.</span>}
      </span>
      <div className="list-section-title">
        Recipes{" "}
        {result.isFetching && <LoaderCircle size={14} className="spin" />}
      </div>
      <ErrorNotice
        error={current && !result.isFetchNextPageError && result.error}
      />
      {current && result.isError && !result.isFetchNextPageError && (
        <Button variant="ghost" onClick={() => void result.refetch()}>
          Retry recipes
        </Button>
      )}
      <div className="food-list">
        {loading ? (
          <FoodListSkeleton
            label={query ? "Searching recipes" : "Loading recipes"}
          />
        ) : (
          recipes.map((recipe) => (
            <div className="food-quick-row" key={recipe.id}>
              {onQuickAdd && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="food-quick-add"
                  aria-label={`Quick add ${recipe.name}`}
                  onClick={() => {
                    onQuickAdd(recipe);
                    setAdded((previous) => ({
                      id: recipe.id,
                      name: recipe.name,
                      count: (previous?.count ?? 0) + 1,
                    }));
                  }}
                >
                  {added?.id === recipe.id ? (
                    <Check size={19} />
                  ) : (
                    <Plus size={19} />
                  )}
                </Button>
              )}
              {onQuickAdd ? (
                <div className="food-row recipe-search-row">
                  <RecipeLabel recipe={recipe} />
                </div>
              ) : (
                <button
                  className="food-row"
                  onClick={() => navigate(`/recipes/${recipe.id}`)}
                >
                  <RecipeLabel recipe={recipe} />
                  <ChevronRight size={17} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
      {!loading && !result.error && !recipes.length && (
        <p className="list-empty">
          {query ? "No matches." : "No recipes yet."}
        </p>
      )}
      {current && !loading && (
        <FoodPageLoader
          root={root}
          hasMore={!!result.hasNextPage}
          loading={result.isFetchingNextPage}
          refreshing={result.isRefetching}
          error={result.isFetchNextPageError ? result.error : null}
          onLoad={loadMore}
          label="recipes"
        />
      )}
    </div>
  );
}

function RecipeLabel({ recipe }: { recipe: Recipe }) {
  return (
    <span className="food-row-text">
      <span className="food-name">{recipe.name}</span>
      <span className="food-meta">
        {recipe.entries.length} foods ·{" "}
        {Math.round(recipe.calories).toLocaleString("en-US")} kcal
      </span>
    </span>
  );
}
