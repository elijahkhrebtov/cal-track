"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus, Search } from "lucide-react";
import { request } from "@/components/api";
import { usePageDraft } from "@/components/drafts";
import { ErrorNotice } from "@/components/forms";
import { FoodListSkeleton } from "@/components/loading";
import { MealEditor } from "@/components/meal-editor";
import { LibraryTabs, RecipeResults } from "@/components/recipe-list";
import { Input } from "@/components/ui/input";
import {
  WorkflowPage,
  goBack,
  navigate,
  returnTo,
} from "@/components/workflow-page";
import type { Recipe } from "@/lib/types";

export function RecipeLibrary({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = usePageDraft("recipes/query", () => "");
  return (
    <WorkflowPage title="Custom foods" onBack={onClose} search>
      <div className="food-search-layout">
        <div className="food-search-input">
          <div className="search-input-wrap">
            <Search size={18} />
            <Input
              autoFocus={false}
              aria-label="Search recipes"
              placeholder="Search recipes"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <LibraryTabs recipes />
        </div>
        <RecipeResults
          query={query.trim().replace(/\s+/g, " ").toLowerCase()}
        />
        <div className="food-search-footer">
          <button
            className="create-food-row"
            onClick={() => navigate("/recipes/new")}
          >
            <span className="create-food-icon">
              <Plus size={18} />
            </span>
            <span>Create recipe</span>
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </WorkflowPage>
  );
}

export function RecipeEditor() {
  const pathname = usePathname();
  const id = pathname.split("/")[2];
  const result = useQuery({
    queryKey: ["recipes", "detail", id],
    queryFn: ({ signal }) => request<Recipe>(`/api/recipes/${id}`, { signal }),
    enabled: id !== "new",
  });
  if (id === "new" || result.data)
    return (
      <MealEditor
        key={id}
        recipeMode
        meal={result.data}
        date=""
        meals={[]}
        basePath={`/recipes/${id}`}
        homePath="/custom-foods/recipes"
        onClose={() => returnTo("/custom-foods/recipes")}
      />
    );
  return (
    <WorkflowPage
      title={result.isPending ? "Loading recipe" : "Recipe unavailable"}
      onBack={() => goBack("/custom-foods/recipes")}
    >
      <div className="sheet-scroll">
        {result.isPending ? (
          <FoodListSkeleton label="Loading recipe" />
        ) : (
          <ErrorNotice error={result.error} />
        )}
      </div>
    </WorkflowPage>
  );
}
