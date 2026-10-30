"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronRight,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  Utensils,
  X,
} from "lucide-react";

import { request } from "@/components/api";
import {
  discardDrafts,
  useDraftStore,
  usePageDraft,
} from "@/components/drafts";
import { FoodListSkeleton } from "@/components/loading";
import {
  FoodPageLoader,
  foodKey,
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
import type { Food, Meal, MealEntry, Nutrients } from "@/lib/types";

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
      <span>
        P <b>{number(values.protein, 1)}</b>
      </span>
      <span>
        F <b>{number(values.fat, 1)}</b>
      </span>
      <span>
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
      <div>
        <strong>{number(values.protein, 1)}</strong>
        <span>Protein · g</span>
      </div>
      <div>
        <strong>{number(values.fat, 1)}</strong>
        <span>Fat · g</span>
      </div>
      <div>
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
}: {
  food: Food;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button className="food-row" onClick={onClick} disabled={busy}>
      <span className="food-row-text">
        <span className="food-name">{food.name}</span>
        <span className="food-meta">
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
}

function FoodSearch({
  onSelect,
  onCustom,
  draftKey,
}: {
  onSelect: (food: Food) => Promise<void>;
  onCustom: () => void;
  draftKey: string;
}) {
  const [query, setQuery] = usePageDraft(`${draftKey}/query`, () => "");
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const currentQuery = query.trim().replace(/\s+/g, " ").toLowerCase();
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [currentQuery]);
  const localQuery = useDebounced(currentQuery, 150);
  const externalQuery = useDebounced(currentQuery, 850);
  const local = useFoodPages("local", localQuery);
  const remote = useFoodPages(
    "external",
    externalQuery,
    externalQuery.length >= 2,
  );
  const localIsCurrent = localQuery === currentQuery;
  const remoteIsCurrent = externalQuery === currentQuery;
  const loadingLocal = !localIsCurrent || local.isPending;
  const loadingRemote =
    currentQuery.length >= 2 && (!remoteIsCurrent || remote.isPending);
  const saved = localIsCurrent ? foodPages(local.data?.pages) : [];
  const savedKeys = new Set(saved.map(foodKey));
  const external = remoteIsCurrent
    ? foodPages(remote.data?.pages).filter(
        (food) => !savedKeys.has(foodKey(food)),
      )
    : [];
  const searchingRemote =
    currentQuery.length >= 2 && (!remoteIsCurrent || remote.isFetching);

  async function select(food: Food) {
    if (resolving) return;
    setResolving(food.id);
    setError(null);
    try {
      await onSelect(food);
    } catch (cause) {
      setError(cause);
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="food-search-layout">
      <div className="food-search-input">
        <div className="search-input-wrap">
          <Search size={18} />
          <Input
            autoComplete="off"
            autoFocus={false}
            aria-label="Search foods"
            placeholder="Search foods"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      <div
        ref={listRef}
        className="food-results-scroll"
        aria-label="Food results"
      >
        <ErrorNotice
          error={
            error ||
            (localIsCurrent && !local.isFetchNextPageError && local.error)
          }
        />
        {localIsCurrent && local.isError && !local.isFetchNextPageError && (
          <Button variant="ghost" onClick={() => void local.refetch()}>
            Retry saved foods
          </Button>
        )}
        <div className="list-section-title">
          {query.trim() ? "Saved foods" : "Recent foods"}
          {local.isFetching && <LoaderCircle size={14} className="spin" />}
        </div>
        <div className="food-list">
          {loadingLocal ? (
            <FoodListSkeleton
              label={
                currentQuery ? "Searching saved foods" : "Loading recent foods"
              }
            />
          ) : (
            saved.map((food) => (
              <FoodRow
                key={food.id}
                food={food}
                onClick={() => void select(food)}
                busy={resolving === food.id}
              />
            ))
          )}
        </div>
        {localIsCurrent && !loadingLocal && (
          <FoodPageLoader
            root={listRef}
            hasMore={!!local.hasNextPage}
            loading={local.isFetchingNextPage}
            refreshing={local.isRefetching}
            error={local.isFetchNextPageError ? local.error : null}
            onLoad={local.loadMore}
            label="saved foods"
          />
        )}
        {!loadingLocal && !local.error && !saved.length && (
          <p className="list-empty">
            {query.trim()
              ? "No saved matches."
              : "Foods from saved meals appear here."}
          </p>
        )}
        {query.trim().length >= 2 && (
          <>
            <div className="list-section-title">
              More results
              {searchingRemote && <LoaderCircle size={14} className="spin" />}
            </div>
            <div className="food-list">
              {loadingRemote ? (
                <FoodListSkeleton label="Searching USDA foods" />
              ) : (
                external.map((food) => (
                  <FoodRow
                    key={food.id}
                    food={food}
                    onClick={() => void select(food)}
                    busy={resolving === food.id}
                  />
                ))
              )}
            </div>
            {!loadingRemote &&
              !external.length &&
              !remote.error &&
              !remote.data?.pages.some((page) => page.warnings?.length) && (
                <p className="list-empty">No additional matches.</p>
              )}
            {remoteIsCurrent && !loadingRemote && (
              <FoodPageLoader
                root={listRef}
                hasMore={!!remote.hasNextPage}
                loading={remote.isFetchingNextPage}
                refreshing={remote.isRefetching}
                error={remote.isFetchNextPageError ? remote.error : null}
                onLoad={remote.loadMore}
                label="USDA foods"
              />
            )}
            <ErrorNotice
              error={
                remoteIsCurrent && !remote.isFetchNextPageError && remote.error
              }
            />
            {remoteIsCurrent &&
              remote.isError &&
              !remote.isFetchNextPageError && (
                <Button variant="ghost" onClick={() => void remote.refetch()}>
                  Retry USDA search
                </Button>
              )}
            {remoteIsCurrent &&
              remote.data?.pages
                .flatMap((page) => page.warnings ?? [])
                .map((warning) => (
                  <p className="inline-warning" role="status" key={warning}>
                    {warning}
                  </p>
                ))}
          </>
        )}
      </div>
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

function FoodDetails({
  food,
  entry,
  onConfirm,
  draftKey,
}: {
  food: Food;
  entry?: MealEntry;
  draftKey: string;
  onConfirm: (values: {
    grams: number;
    quantity: number;
    servingName: string;
  }) => void;
}) {
  const matchingServing = food.servings.find(
    (serving) => serving.name === entry?.servingName,
  );
  const initialUnit = matchingServing ? matchingServing.id : "g";
  const [unit, setUnit] = usePageDraft(`${draftKey}/unit`, () => initialUnit);
  const [amount, setAmount] = usePageDraft(`${draftKey}/amount`, () =>
    entry
      ? (initialUnit === "g" ? entry.grams : entry.quantity).toString()
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
        Per 100 g: {number(food.calories)} kcal · P {number(food.protein, 1)} ·
        F {number(food.fat, 1)} · C {number(food.carbs, 1)}
      </p>
      <Button type="submit" disabled={!valid}>
        {entry ? "Update food entry" : "Add to meal"}
        <Plus size={17} />
      </Button>
    </form>
  );
}

export function MealEditor({
  meal,
  date,
  meals,
  onClose,
  basePath,
  homePath,
}: {
  meal?: Meal;
  date: string;
  meals: Meal[];
  onClose: () => void;
  basePath: string;
  homePath: string;
}) {
  const drafts = useDraftStore();
  const draftKey = datedPath(basePath, date);
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
  const route = (suffix = "") => datedPath(`${basePath}${suffix}`, date);
  const queryClient = useQueryClient();
  const nextMealNumber =
    Math.max(
      meals.length,
      ...meals.map((item) => Number(item.name.match(/^Meal (\d+)$/)?.[1] || 0)),
    ) + 1;
  const [baseline] = usePageDraft(`${draftKey}/baseline`, () => ({
    name: meal?.name || `Meal ${nextMealNumber}`,
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
    entryIndex >= 0
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
    if (dirty && !window.confirm("Discard unsaved meal changes?")) return;
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

  async function selectFood(food: Food) {
    const resolved =
      food.source === "custom"
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
    setSelectedFoods((previous) => ({ ...previous, [resolved.id]: resolved }));
    navigate(route(`/food/${encodeURIComponent(resolved.id)}`));
  }

  function addEntry(values: {
    grams: number;
    quantity: number;
    servingName: string;
  }) {
    if (!selection) return;
    const previous =
      selection.index === undefined ? undefined : entries[selection.index];
    const entry: MealEntry = {
      id: previous?.id || crypto.randomUUID(),
      foodId: selection.food.id,
      food: selection.food,
      ...values,
      ...scaleNutrients(selection.food, values.grams),
    };
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
      await request<Meal>("/api/meals", {
        method: "POST",
        body: JSON.stringify({
          id: meal?.id,
          date,
          name: name.trim(),
          entries: entries.map((entry) => ({
            id: entry.id,
            food: entry.food,
            grams: entry.grams,
            quantity: entry.quantity,
            servingName: entry.servingName,
          })),
        }),
      });
      await Promise.all([
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
      await request(`/api/meals/${meal.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
        ? "Edit meal"
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
        screen === "meal"
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
              <Field label="Meal name">
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
                  {entries.length} {entries.length === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="entry-list">
                {entries.map((entry, index) => (
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
                          previous.filter(
                            (_, entryIndex) => entryIndex !== index,
                          ),
                        )
                      }
                    >
                      <X size={17} />
                    </Button>
                  </div>
                ))}
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
                    Delete meal
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
                <SavingLabel saving={saving}>Save meal</SavingLabel>
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
                Back to meal
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
          </div>
          <div
            ref={listRef}
            className="food-results-scroll"
            aria-label="Custom food results"
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
