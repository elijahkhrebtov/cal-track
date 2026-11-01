"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronRight,
  ChevronDown,
  BookOpen,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  Utensils,
  X,
} from "lucide-react";

import { LibraryTabs, RecipeResults } from "@/components/recipe-list";
import {
  entryReferences,
  groupEntries,
  recipeDraftEntries,
} from "@/lib/recipe-entries";
import { request } from "@/components/api";
import {
  discardDrafts,
  useDraftStore,
  usePageDraft,
} from "@/components/drafts";
import { FoodListSkeleton } from "@/components/loading";
import {
  FoodPageLoader,
  foodPages,
  useFoodPages,
} from "@/components/food-pagination";
import { ErrorNotice, Field, FoodForm, SavingLabel } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  WorkflowPage,
  datedPath,
  goBack,
  navigate,
  returnTo,
} from "@/components/workflow-page";
import { scaleNutrients, sumNutrients } from "@/lib/nutrition";
import { draftId } from "@/lib/draft-id";
import type {
  Food,
  FoodPortion,
  FoodSearchResult,
  Meal,
  MealEntry,
  Nutrients,
  Recipe,
} from "@/lib/types";

export function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

export function number(value: number, digits = 0) {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function MacroLine({ values }: { values: Nutrients }) {
  return (
    <span className="macro-line">
      <span className="macro-protein">
        P <b>{number(values.protein, 1)}</b>
      </span>
      <span className="macro-fat">
        F <b>{number(values.fat, 1)}</b>
      </span>
      <span className="macro-carbs">
        C <b>{number(values.carbs, 1)}</b>
      </span>
      <span className="macro-unit">g</span>
    </span>
  );
}

export function NutritionStrip({ values }: { values: Nutrients }) {
  return (
    <div className="nutrition-strip">
      <div>
        <strong>{number(values.calories)}</strong>
        <span>kcal</span>
      </div>
      <div className="macro-protein">
        <strong>{number(values.protein, 1)}</strong>
        <span>Protein · g</span>
      </div>
      <div className="macro-fat">
        <strong>{number(values.fat, 1)}</strong>
        <span>Fat · g</span>
      </div>
      <div className="macro-carbs">
        <strong>{number(values.carbs, 1)}</strong>
        <span>Carbs · g</span>
      </div>
    </div>
  );
}

export function SourceBadge({ source }: { source: Food["source"] }) {
  return (
    <span className={`source-badge source-${source}`}>
      {source === "usda" ? "USDA" : "Custom"}
    </span>
  );
}

export function FoodRow({
  food,
  onClick,
  busy,
  portion,
  onQuickAdd,
  quickAdding,
  added,
}: {
  food: Food;
  onClick: () => void;
  busy?: boolean;
  portion?: FoodPortion;
  onQuickAdd?: () => void;
  quickAdding?: boolean;
  added?: boolean;
}) {
  const details = (
    <button
      className="food-row"
      onClick={onClick}
      disabled={busy || quickAdding}
    >
      <span className="food-row-text">
        <span className="food-name">{food.name}</span>
        <span className="food-meta">
          {portion && (
            <span className="food-portion">
              {portion.servingName === "g"
                ? `${number(portion.grams, 1)} g`
                : `${number(portion.quantity, 2)} ${portion.servingName} · ${number(portion.grams, 1)} g`}
            </span>
          )}
          <SourceBadge source={food.source} />
          {food.brand && <span className="food-brand">{food.brand}</span>}
        </span>
      </span>
      <span className="food-row-end">
        {busy ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <ChevronRight size={17} />
        )}
      </span>
    </button>
  );
  if (!onQuickAdd) return details;
  return (
    <div className="food-quick-row">
      <Button
        variant="secondary"
        size="icon"
        className="food-quick-add"
        aria-label={`Quick add ${food.name}`}
        title={`Quick add ${food.name}`}
        disabled={busy || quickAdding}
        onClick={onQuickAdd}
      >
        {quickAdding ? (
          <LoaderCircle size={18} className="spin" />
        ) : added ? (
          <Check size={19} />
        ) : (
          <Plus size={19} />
        )}
      </Button>
      {details}
    </div>
  );
}

const foodSearchTabs = [
  { id: "recent", label: "Recent" },
  { id: "local", label: "My foods" },
  { id: "external", label: "Food database" },
  { id: "recipes", label: "Recipes" },
] as const;
type FoodSearchTab = (typeof foodSearchTabs)[number]["id"];

function FoodSearch({
  onSelect,
  onQuickAdd,
  onCustom,
  onRecipe,
  entity,
  draftKey,
}: {
  onSelect: (food: Food, portion?: FoodPortion) => Promise<void>;
  onQuickAdd: (food: Food, portion: FoodPortion) => Promise<void>;
  onCustom: () => void;
  onRecipe?: (recipe: Recipe) => void;
  entity: string;
  draftKey: string;
}) {
  const tabs = foodSearchTabs.filter(
    (item) => item.id !== "recipes" || onRecipe,
  );
  const [query, setQuery] = usePageDraft(`${draftKey}/query`, () => "");
  const [tab, setTab] = usePageDraft<FoodSearchTab>(
    `${draftKey}/tab`,
    () => "recent",
  );
  const [resolving, setResolving] = useState<string | null>(null);
  const [quickAdding, setQuickAdding] = useState(false);
  const selectionInFlight = useRef(false);
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
  const [error, setError] = useState<unknown>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const currentQuery = query.trim().replace(/\s+/g, " ").toLowerCase();
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [currentQuery, tab]);
  const localQuery = useDebounced(currentQuery, 150);
  const externalQuery = useDebounced(currentQuery, 850);
  const local = useFoodPages(
    tab === "recent" ? "recent" : "local",
    localQuery,
    tab !== "external" && tab !== "recipes",
  );
  const remote = useFoodPages(
    "external",
    externalQuery,
    tab === "external" && externalQuery.length >= 2,
  );
  const results = tab === "external" ? remote : local;
  const isCurrent =
    (tab === "external" ? externalQuery : localQuery) === currentQuery;
  const canSearch = tab !== "external" || currentQuery.length >= 2;
  const loading = canSearch && (!isCurrent || results.isPending);
  const found = isCurrent ? foodPages(results.data?.pages) : [];
  const label =
    tab === "recent"
      ? "recent foods"
      : tab === "local"
        ? "my foods"
        : "USDA foods";
  const warnings =
    tab === "external" && isCurrent
      ? (results.data?.pages.flatMap((page) => page.warnings ?? []) ?? [])
      : [];

  async function select(result: FoodSearchResult, quick = false) {
    if (selectionInFlight.current || (quick && !result.lastEntry)) return;
    selectionInFlight.current = true;
    const { lastEntry, ...food } = result;
    setResolving(food.id);
    setQuickAdding(quick);
    setError(null);
    try {
      if (quick && lastEntry) {
        await onQuickAdd(food, lastEntry);
        setAdded((previous) => ({
          id: food.id,
          name: food.name,
          count: (previous?.count ?? 0) + 1,
        }));
      } else {
        await onSelect(food, lastEntry);
      }
    } catch (cause) {
      setError(cause);
    } finally {
      setResolving(null);
      setQuickAdding(false);
      selectionInFlight.current = false;
    }
  }

  return (
    <div className="food-search-layout">
      <span className="sr-only" role="status" aria-atomic="true">
        {added && (
          <span key={`${added.id}:${added.count}`}>
            Added {added.name} to {entity}.
          </span>
        )}
      </span>
      <div className="food-search-input">
        <div className="search-input-wrap">
          <Search size={18} />
          <Input
            autoComplete="off"
            autoFocus={false}
            aria-label={tab === "recipes" ? "Search recipes" : "Search foods"}
            placeholder={tab === "recipes" ? "Search recipes" : "Search foods"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          )}
        </div>
        <div
          className="food-search-tabs"
          role="tablist"
          aria-label="Food sources"
        >
          {tabs.map((item, index) => (
            <button
              key={item.id}
              id={`food-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={
                item.id === "recipes"
                  ? "recipe-results-panel"
                  : "food-results-panel"
              }
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => {
                setTab(item.id);
                setError(null);
              }}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                setTab(tabs[next].id);
                setError(null);
                document.getElementById(`food-tab-${tabs[next].id}`)?.focus();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "recipes" && onRecipe ? (
        <RecipeResults query={currentQuery} onQuickAdd={onRecipe} />
      ) : (
        <div
          ref={listRef}
          id="food-results-panel"
          role="tabpanel"
          aria-labelledby={`food-tab-${tab}`}
          className="food-results-scroll"
          aria-label="Food results"
          tabIndex={0}
        >
          <ErrorNotice
            error={
              error ||
              (isCurrent && !results.isFetchNextPageError && results.error)
            }
          />
          {isCurrent && results.isError && !results.isFetchNextPageError && (
            <Button variant="ghost" onClick={() => void results.refetch()}>
              Retry {label}
            </Button>
          )}
          <div className="list-section-title">
            {tab === "recent"
              ? "Last logged portions"
              : tab === "local"
                ? "Custom & saved foods"
                : "USDA FoodData Central"}
            {canSearch && results.isFetching && (
              <LoaderCircle size={14} className="spin" />
            )}
          </div>
          <div className="food-list">
            {loading ? (
              <FoodListSkeleton
                label={`${currentQuery ? "Searching" : "Loading"} ${label}`}
              />
            ) : canSearch ? (
              found.map((food) => (
                <FoodRow
                  key={food.id}
                  food={food}
                  portion={food.lastEntry}
                  onClick={() => void select(food)}
                  busy={resolving === food.id && !quickAdding}
                  onQuickAdd={
                    tab === "recent" && food.lastEntry
                      ? () => void select(food, true)
                      : undefined
                  }
                  quickAdding={resolving === food.id && quickAdding}
                  added={added?.id === food.id}
                />
              ))
            ) : null}
          </div>
          {canSearch && isCurrent && !loading && (
            <FoodPageLoader
              root={listRef}
              hasMore={!!results.hasNextPage}
              loading={results.isFetchingNextPage}
              refreshing={results.isRefetching}
              error={results.isFetchNextPageError ? results.error : null}
              onLoad={results.loadMore}
              label={label}
            />
          )}
          {!canSearch ? (
            <p className="list-empty">
              Enter at least 2 characters to search the food database.
            </p>
          ) : !loading &&
            !results.error &&
            !found.length &&
            !warnings.length ? (
            <p className="list-empty">
              {currentQuery
                ? "No matches."
                : tab === "recent"
                  ? "Foods from saved meals appear here."
                  : "Create a food or save one from the food database."}
            </p>
          ) : null}
          {warnings.map((warning) => (
            <p className="inline-warning" role="status" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      )}
      <div className="food-search-footer">
        <button className="create-food-row" onClick={onCustom}>
          <span className="create-food-icon">
            <Plus size={18} />
          </span>
          <span>Create custom food</span>
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}

function mealDraftEntry(
  food: Food,
  values: FoodPortion,
  id = draftId(),
): MealEntry {
  return {
    id,
    foodId: food.id,
    food,
    ...values,
    ...scaleNutrients(food, values.grams),
  };
}

function FoodDetails({
  food,
  entry,
  initialPortion,
  onConfirm,
  draftKey,
  entity = "meal",
}: {
  entity?: string;
  food: Food;
  entry?: MealEntry;
  initialPortion?: FoodPortion;
  draftKey: string;
  onConfirm: (values: {
    grams: number;
    quantity: number;
    servingName: string;
  }) => void;
}) {
  const portion = entry ?? initialPortion;
  const matchingServing = food.servings.find(
    (serving) => serving.name === portion?.servingName,
  );
  const initialUnit = matchingServing ? matchingServing.id : "g";
  const [unit, setUnit] = usePageDraft(`${draftKey}/unit`, () => initialUnit);
  const [amount, setAmount] = usePageDraft(`${draftKey}/amount`, () =>
    portion
      ? (initialUnit === "g" ? portion.grams : portion.quantity).toString()
      : "100",
  );
  const selectedServing = food.servings.find((serving) => serving.id === unit);
  const quantity = Number(amount);
  const grams = quantity * (selectedServing?.grams || 1);
  const valid = Number.isFinite(grams) && grams > 0 && grams <= 10000;
  const totals = scaleNutrients(food, valid ? grams : 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid)
      onConfirm({
        grams: Math.round(grams * 1000) / 1000,
        quantity,
        servingName: selectedServing?.name || "g",
      });
  }

  return (
    <form onSubmit={submit} className="sheet-scroll form-stack">
      <div className="food-detail-heading">
        <span className="food-detail-icon">
          <Utensils size={24} />
        </span>
        <h3>{food.name}</h3>
        <div className="food-meta">
          <SourceBadge source={food.source} />
          {food.brand && <span>{food.brand}</span>}
        </div>
      </div>
      <div className="form-grid">
        <Field label="Amount">
          <Input
            type="number"
            inputMode="decimal"
            required
            min="0.001"
            max={selectedServing ? 10000 / selectedServing.grams : 10000}
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="Unit">
          <select
            className="input"
            value={unit}
            onChange={(event) => {
              setUnit(event.target.value);
              setAmount(event.target.value === "g" ? "100" : "1");
            }}
          >
            <option value="g">grams</option>
            {food.servings.map((serving) => (
              <option value={serving.id} key={serving.id}>
                {serving.name} ({number(serving.grams, 1)} g)
              </option>
            ))}
          </select>
        </Field>
      </div>
      {selectedServing && (
        <p className="muted-note">{number(valid ? grams : 0, 1)} g total</p>
      )}
      <NutritionStrip values={totals} />
      <p className="muted-note">
        Per 100 g: {number(food.calories)} kcal ·{" "}
        <span className="macro-protein">P {number(food.protein, 1)}</span> ·{" "}
        <span className="macro-fat">F {number(food.fat, 1)}</span> ·{" "}
        <span className="macro-carbs">C {number(food.carbs, 1)}</span>
      </p>
      <Button type="submit" disabled={!valid}>
        {entry ? "Update food entry" : `Add to ${entity}`}
        <Plus size={17} />
      </Button>
    </form>
  );
}

function RecipeEntryGroup({
  entries,
  onRemove,
}: {
  entries: MealEntry[];
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const recipe = entries[0].recipe!;
  const totals = sumNutrients(entries);
  return (
    <div className="recipe-entry-group">
      <div className="entry-row">
        <button
          type="button"
          className="entry-edit"
          aria-expanded={expanded}
          aria-controls={`recipe-${recipe.id}`}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="entry-name recipe-entry-name">
            <BookOpen size={15} />
            {recipe.name}
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <span className="entry-amount">Recipe · {entries.length} foods</span>
          <MacroLine values={totals} />
        </button>
        <span className="entry-calories">
          {number(totals.calories)}
          <small>kcal</small>
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove recipe ${recipe.name}`}
          onClick={onRemove}
        >
          <X size={17} />
        </Button>
      </div>
      <div
        id={`recipe-${recipe.id}`}
        hidden={!expanded}
        className="recipe-ingredients"
      >
        {entries.map((entry) => (
          <div className="entry-row" key={entry.id}>
            <div className="entry-edit">
              <span className="entry-name">{entry.food.name}</span>
              <span className="entry-amount">
                {entry.servingName === "g"
                  ? `${number(entry.grams, 1)} g`
                  : `${number(entry.quantity, 2)} ${entry.servingName} · ${number(entry.grams, 1)} g`}
              </span>
              <MacroLine values={entry} />
            </div>
            <span className="entry-calories">
              {number(entry.calories)}
              <small>kcal</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MealEditor({
  meal,
  date,
  meals,
  onClose,
  basePath,
  homePath,
  recipeMode = false,
}: {
  recipeMode?: boolean;
  meal?: Meal | Recipe;
  date: string;
  meals: Meal[];
  onClose: () => void;
  basePath: string;
  homePath: string;
}) {
  const drafts = useDraftStore();
  const draftKey = recipeMode ? basePath : datedPath(basePath, date);
  const pathname = usePathname();
  const screen =
    pathname === `${basePath}/search`
      ? "search"
      : pathname === `${basePath}/custom-food`
        ? "custom"
        : pathname.startsWith(`${basePath}/food/`) ||
            pathname.startsWith(`${basePath}/entry/`)
          ? "details"
          : "meal";
  const route = (suffix = "") =>
    recipeMode
      ? `${basePath}${suffix}`
      : datedPath(`${basePath}${suffix}`, date);
  const entity = recipeMode ? "recipe" : "meal";
  const queryClient = useQueryClient();
  const nextMealNumber =
    Math.max(
      meals.length,
      ...meals.map((item) => Number(item.name.match(/^Meal (\d+)$/)?.[1] || 0)),
    ) + 1;
  const [baseline] = usePageDraft(`${draftKey}/baseline`, () => ({
    name: meal?.name || (recipeMode ? "" : `Meal ${nextMealNumber}`),
    entries: meal?.entries || [],
  }));
  const originalName = baseline.name;
  const [name, setName] = usePageDraft(`${draftKey}/name`, () => originalName);
  const [entries, setEntries] = usePageDraft<MealEntry[]>(
    `${draftKey}/entries`,
    () => baseline.entries,
  );
  const [selectedFoods, setSelectedFoods] = usePageDraft<Record<string, Food>>(
    `${draftKey}/selected`,
    () => ({}),
  );
  const [selectedPortions, setSelectedPortions] = usePageDraft<
    Record<string, FoodPortion | undefined>
  >(`${draftKey}/portions`, () => ({}));
  const entryId = pathname.startsWith(`${basePath}/entry/`)
    ? pathname.split("/").pop()
    : undefined;
  const entryIndex = entryId
    ? entries.findIndex((entry) => entry.id === entryId)
    : -1;
  const foodId = pathname.startsWith(`${basePath}/food/`)
    ? decodeURIComponent(pathname.split("/").pop() || "")
    : "";
  const selectedFood = selectedFoods[foodId];
  const details = useQuery({
    queryKey: foodId.startsWith("usda:")
      ? ["food-details", "usda", foodId.slice(5)]
      : ["custom-food", foodId],
    queryFn: ({ signal }) =>
      request<Food>(
        foodId.startsWith("usda:")
          ? `/api/foods/resolve?source=usda&id=${encodeURIComponent(foodId.slice(5))}`
          : `/api/foods/${encodeURIComponent(foodId)}`,
        { signal },
      ),
    enabled: screen === "details" && !!foodId && !selectedFood,
    staleTime: foodId.startsWith("usda:") ? 180 * 24 * 60 * 60_000 : 30_000,
    gcTime: foodId.startsWith("usda:") ? 24 * 60 * 60_000 : 5 * 60_000,
  });
  const selection =
    entryIndex >= 0 && !entries[entryIndex].recipe
      ? { food: entries[entryIndex].food, index: entryIndex }
      : selectedFood || details.data
        ? { food: selectedFood || details.data!, index: undefined }
        : null;
  const [customDirty, setCustomDirty] = usePageDraft(
    `${draftKey}/custom-dirty`,
    () => false,
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const dirty =
    name !== originalName ||
    JSON.stringify(entries) !== JSON.stringify(baseline.entries) ||
    customDirty;
  const totals = sumNutrients(entries);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function close() {
    if (saving || deleting) return;
    if (dirty && !window.confirm(`Discard unsaved ${entity} changes?`)) return;
    discardDrafts(drafts, draftKey);
    onClose();
  }

  function back() {
    goBack(screen === "meal" ? homePath : route());
    setError(null);
  }

  function cancelCustom() {
    if (
      screen === "custom" &&
      customDirty &&
      !window.confirm("Discard this food?")
    )
      return;
    if (screen === "custom") {
      setCustomDirty(false);
      discardDrafts(drafts, `${draftKey}/custom`);
    }
    back();
  }

  async function resolveFood(food: Food) {
    return food.source === "custom"
      ? food
      : await queryClient.fetchQuery({
          queryKey: ["food-details", food.source, food.externalId || food.id],
          queryFn: ({ signal }) =>
            request<Food>(
              `/api/foods/resolve?source=${food.source}&id=${encodeURIComponent(food.externalId || food.id)}`,
              { signal },
            ),
          staleTime: 180 * 24 * 60 * 60_000,
          gcTime: 24 * 60 * 60_000,
        });
  }

  async function selectFood(food: Food, portion?: FoodPortion) {
    const resolved = await resolveFood(food);
    setSelectedFoods((previous) => ({ ...previous, [resolved.id]: resolved }));
    setSelectedPortions((previous) => ({
      ...previous,
      [resolved.id]: portion,
    }));
    navigate(route(`/food/${encodeURIComponent(resolved.id)}`));
  }

  async function quickAddFood(food: Food, portion: FoodPortion) {
    const resolved = await resolveFood(food);
    // Repeat the recorded mass exactly. If a serving was removed or its weight
    // changed, use grams so the new entry still has a valid unit conversion.
    const sameServing = resolved.servings.some(
      (serving) =>
        serving.name === portion.servingName &&
        Math.abs(serving.grams * portion.quantity - portion.grams) < 0.001,
    );
    const values = sameServing
      ? portion
      : {
          grams: portion.grams,
          quantity: portion.grams,
          servingName: "g",
        };
    const entry = mealDraftEntry(resolved, values);
    setEntries((previous) => [...previous, entry]);
  }

  function addEntry(values: {
    grams: number;
    quantity: number;
    servingName: string;
  }) {
    if (!selection) return;
    const previous =
      selection.index === undefined ? undefined : entries[selection.index];
    const entry = mealDraftEntry(selection.food, values, previous?.id);
    setEntries((previousEntries) =>
      selection.index === undefined
        ? [...previousEntries, entry]
        : previousEntries.map((item, index) =>
            index === selection.index ? entry : item,
          ),
    );
    discardDrafts(drafts, `${draftKey}/details/${pathname}`);
    returnTo(route());
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entries.length) {
      setError(new Error("Add at least one food."));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await request<Meal | Recipe>(recipeMode ? "/api/recipes" : "/api/meals", {
        method: "POST",
        body: JSON.stringify({
          id: meal?.id,
          date,
          name: name.trim(),
          entries: entryReferences(entries),
        }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recipes"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({
          queryKey: ["foods"],
          predicate: (query) => query.queryKey[1] !== "external",
        }),
      ]);
      discardDrafts(drafts, draftKey);
      onClose();
    } catch (cause) {
      setError(cause);
    } finally {
      setSaving(false);
    }
  }

  async function removeMeal() {
    if (!meal || !window.confirm(`Delete “${meal.name}”?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await request(`/api/${recipeMode ? "recipes" : "meals"}/${meal.id}`, {
        method: "DELETE",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recipes"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["foods", "recent"] }),
      ]);
      discardDrafts(drafts, draftKey);
      onClose();
    } catch (cause) {
      setError(cause);
    } finally {
      setDeleting(false);
    }
  }

  const title =
    screen === "meal"
      ? meal
        ? `Edit ${entity}`
        : recipeMode
          ? "Create recipe"
          : "Log meal"
      : screen === "search"
        ? "Search foods"
        : screen === "custom"
          ? "Custom food"
          : "Food details";

  return (
    <WorkflowPage
      title={title}
      search={screen === "search"}
      onBack={back}
      description={
        screen === "meal" && !recipeMode
          ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })
          : undefined
      }
    >
      {screen === "meal" && (
        <div className="workflow-screen">
          <form className="meal-form" onSubmit={save}>
            <div className="sheet-scroll form-stack">
              <Field label={recipeMode ? "Recipe name" : "Meal name"}>
                <Input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <NutritionStrip values={totals} />
              <div className="form-section-label">
                <span>Foods</span>
                <span>
                  {groupEntries(entries).length}{" "}
                  {groupEntries(entries).length === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="entry-list">
                {groupEntries(entries).map((group) => {
                  const entry = group[0];
                  if (entry.recipe)
                    return (
                      <RecipeEntryGroup
                        key={entry.recipe.id}
                        entries={group}
                        onRemove={() =>
                          setEntries((previous) =>
                            previous.filter(
                              (item) => item.recipe?.id !== entry.recipe!.id,
                            ),
                          )
                        }
                      />
                    );
                  return (
                    <div className="entry-row" key={entry.id}>
                      <button
                        className="entry-edit"
                        onClick={() => {
                          navigate(route(`/entry/${entry.id}`));
                        }}
                        type="button"
                      >
                        <span className="entry-name">{entry.food.name}</span>
                        <span className="entry-amount">
                          {entry.servingName === "g"
                            ? `${number(entry.grams, 1)} g`
                            : `${number(entry.quantity, 2)} ${entry.servingName} · ${number(entry.grams, 1)} g`}
                        </span>
                        <MacroLine values={entry} />
                      </button>
                      <span className="entry-calories">
                        {number(entry.calories)}
                        <small>kcal</small>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${entry.food.name}`}
                        onClick={() =>
                          setEntries((previous) =>
                            previous.filter((item) => item.id !== entry.id),
                          )
                        }
                      >
                        <X size={17} />
                      </Button>
                    </div>
                  );
                })}
              </div>
              {!entries.length && (
                <div className="empty-state compact">
                  <Utensils size={24} />
                  <p>No foods added</p>
                </div>
              )}
              <div className="form-actions">
                <Button
                  variant="secondary"
                  className="flex-fill"
                  onClick={() => navigate(route("/search"))}
                >
                  <Search size={17} />
                  Add food
                </Button>
                <Button
                  variant="secondary"
                  className="flex-fill"
                  onClick={() => navigate(route("/custom-food"))}
                >
                  <Plus size={17} />
                  Custom food
                </Button>
              </div>
              <ErrorNotice error={error} />
              {meal && (
                <Button
                  variant="destructive"
                  className="align-start"
                  disabled={saving || deleting}
                  onClick={() => void removeMeal()}
                >
                  <SavingLabel saving={deleting}>
                    <Trash2 size={16} />
                    Delete {entity}
                  </SavingLabel>
                </Button>
              )}
            </div>
            <div className="sheet-footer">
              <Button
                variant="secondary"
                onClick={close}
                disabled={saving || deleting}
              >
                Discard
              </Button>
              <Button
                className="flex-fill"
                type="submit"
                disabled={saving || deleting || !entries.length}
              >
                <SavingLabel saving={saving}>Save {entity}</SavingLabel>
              </Button>
            </div>
          </form>
        </div>
      )}
      {screen === "search" && (
        <div className="workflow-screen">
          <FoodSearch
            draftKey={`${draftKey}/search`}
            onSelect={selectFood}
            onQuickAdd={quickAddFood}
            entity={entity}
            onRecipe={
              recipeMode
                ? undefined
                : (recipe) =>
                    setEntries((previous) => [
                      ...previous,
                      ...recipeDraftEntries(recipe, draftId),
                    ])
            }
            onCustom={() => navigate(route("/custom-food"))}
          />
        </div>
      )}
      {screen === "custom" && (
        <div className="workflow-screen">
          <div className="sheet-scroll">
            <FoodForm
              draftKey={`${draftKey}/custom`}
              onDirtyChange={() => setCustomDirty(true)}
              onCancel={cancelCustom}
              onSaved={(food) => {
                setCustomDirty(false);
                setSelectedFoods((previous) => ({
                  ...previous,
                  [food.id]: food,
                }));
                navigate(route(`/food/${encodeURIComponent(food.id)}`), true);
              }}
            />
          </div>
        </div>
      )}
      {screen === "details" && selection && (
        <FoodDetails
          key={`${selection.food.id}:${selection.index ?? "new"}`}
          draftKey={`${draftKey}/details/${pathname}`}
          food={selection.food}
          entity={entity}
          initialPortion={selectedPortions[selection.food.id]}
          entry={
            selection.index === undefined ? undefined : entries[selection.index]
          }
          onConfirm={addEntry}
        />
      )}
      {screen === "details" && !selection && (
        <div className="sheet-scroll">
          {details.isPending ? (
            <FoodListSkeleton label="Loading food details" />
          ) : (
            <>
              <ErrorNotice
                error={
                  details.error ||
                  new Error("This food entry is no longer in the meal.")
                }
              />
              <Button variant="secondary" onClick={() => returnTo(route())}>
                Back to {entity}
              </Button>
            </>
          )}
        </div>
      )}
    </WorkflowPage>
  );
}

export function CustomFoodLibrary({ onClose }: { onClose: () => void }) {
  const drafts = useDraftStore();
  const pathname = usePathname();
  const editingId = pathname.startsWith("/custom-foods/")
    ? pathname.split("/").pop()
    : undefined;
  const [query, setQuery] = usePageDraft("custom-foods/query", () => "");
  const [selectedFoods, setSelectedFoods] = useState<Record<string, Food>>({});
  const detail = useQuery({
    queryKey: ["custom-food", editingId],
    queryFn: ({ signal }) =>
      request<Food>(`/api/foods/${editingId}`, { signal }),
    enabled: !!editingId && editingId !== "new" && !selectedFoods[editingId],
  });
  const editing =
    editingId === "new"
      ? null
      : editingId
        ? selectedFoods[editingId] || detail.data
        : undefined;
  const listing = !editingId;
  const [dirtyFoods, setDirtyFoods] = usePageDraft<Record<string, boolean>>(
    "custom-foods/dirty",
    () => ({}),
  );
  const dirty = !!editingId && !!dirtyFoods[editingId];
  const draftKey = `custom-foods/forms/${editingId}`;
  function setDirty(value: boolean) {
    if (editingId)
      setDirtyFoods((previous) => ({ ...previous, [editingId]: value }));
  }
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const currentQuery = query.trim().replace(/\s+/g, " ").toLowerCase();
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [currentQuery]);
  const debounced = useDebounced(currentQuery, 150);
  const queryClient = useQueryClient();
  const result = useFoodPages("custom", debounced);
  const isCurrent = debounced === currentQuery;
  const loading = !isCurrent || result.isPending;
  const foods = isCurrent ? foodPages(result.data?.pages) : [];

  function close() {
    if (dirty && !window.confirm("Discard unsaved food changes?")) return;
    onClose();
  }

  function back() {
    if (dirty && !window.confirm("Discard unsaved food changes?")) return;
    setDirty(false);
    discardDrafts(drafts, draftKey);
    goBack("/custom-foods");
    setError(null);
  }

  async function removeFood() {
    if (
      !editing ||
      !window.confirm(`Delete “${editing.name}”? Existing meals will be kept.`)
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      await request(`/api/foods/${editing.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({
        queryKey: ["foods"],
        predicate: (query) => query.queryKey[1] !== "external",
      });
      returnTo("/custom-foods");
      discardDrafts(drafts, draftKey);
      setDirty(false);
    } catch (cause) {
      setError(cause);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <WorkflowPage
      title={
        listing
          ? "Custom foods"
          : editingId === "new"
            ? "Create food"
            : "Edit food"
      }
      onBack={listing ? close : () => goBack("/custom-foods")}
      search={listing}
    >
      <div hidden={!listing} className="workflow-screen">
        <div className="food-search-layout">
          <div className="food-search-input">
            <div className="search-input-wrap">
              <Search size={18} />
              <Input
                autoFocus={false}
                aria-label="Search custom foods"
                placeholder="Search custom foods"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <LibraryTabs />
          </div>
          <div
            ref={listRef}
            className="food-results-scroll"
            aria-label="Custom food results"
            role="tabpanel"
            id="library-foods-panel"
            aria-labelledby="library-foods-tab"
          >
            <div className="list-section-title">
              <span>{loading ? "Loading foods" : `${foods.length} foods`}</span>
              {result.isFetching && <LoaderCircle size={14} className="spin" />}
            </div>
            <ErrorNotice
              error={isCurrent && !result.isFetchNextPageError && result.error}
            />
            {isCurrent && result.isError && !result.isFetchNextPageError && (
              <Button variant="ghost" onClick={() => void result.refetch()}>
                Retry custom foods
              </Button>
            )}
            <div className="food-list">
              {loading ? (
                <FoodListSkeleton
                  label={
                    query.trim()
                      ? "Searching custom foods"
                      : "Loading custom foods"
                  }
                />
              ) : (
                foods.map((food) => (
                  <FoodRow
                    food={food}
                    key={food.id}
                    onClick={() => {
                      setSelectedFoods((previous) => ({
                        ...previous,
                        [food.id]: food,
                      }));
                      navigate(`/custom-foods/${food.id}`);
                    }}
                  />
                ))
              )}
            </div>
            {isCurrent && !loading && (
              <FoodPageLoader
                root={listRef}
                hasMore={!!result.hasNextPage}
                loading={result.isFetchingNextPage}
                refreshing={result.isRefetching}
                error={result.isFetchNextPageError ? result.error : null}
                onLoad={result.loadMore}
                label="custom foods"
              />
            )}
            {!loading && !result.error && !foods.length && (
              <div className="empty-state">
                <Utensils size={24} />
                <p>{query ? "No matches" : "No custom foods"}</p>
              </div>
            )}
          </div>
          <div className="food-search-footer">
            <button
              className="create-food-row"
              onClick={() => navigate("/custom-foods/new")}
            >
              <span className="create-food-icon">
                <Plus size={18} />
              </span>
              <span>Create custom food</span>
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>
      {!listing && (editingId === "new" || editing) ? (
        <div className="sheet-scroll">
          <FoodForm
            key={editing?.id || "new"}
            draftKey={draftKey}
            food={editing || undefined}
            onCancel={back}
            onDirtyChange={() => setDirty(true)}
            onSaved={() => {
              if (editingId)
                setSelectedFoods((previous) => {
                  const next = { ...previous };
                  delete next[editingId];
                  return next;
                });
              void queryClient.invalidateQueries({ queryKey: ["custom-food"] });
              returnTo("/custom-foods");
              setDirty(false);
            }}
          />
          {editing && (
            <div className="library-delete">
              <Button
                variant="destructive"
                onClick={() => void removeFood()}
                disabled={deleting}
              >
                <SavingLabel saving={deleting}>
                  <Trash2 size={16} />
                  Delete food
                </SavingLabel>
              </Button>
              <ErrorNotice error={error} />
            </div>
          )}
        </div>
      ) : !listing ? (
        <div className="sheet-scroll">
          {detail.isPending ? (
            <FoodListSkeleton label="Loading custom food" />
          ) : (
            <ErrorNotice error={detail.error} />
          )}
        </div>
      ) : null}
    </WorkflowPage>
  );
}
