import type { Food, Nutrients, Serving } from "../types";
import { cached } from "./cache";
import {
  completeNutrients,
  list,
  number,
  normalizeSearchQuery,
  object,
  ProviderError,
  rounded,
  scale,
  text,
} from "./common";
import { fetchJson } from "./http";

const BASE_URL = "https://api.nal.usda.gov/fdc/v1";
const PAGE_SIZE = 20;
const SEARCH_CACHE_SECONDS = 7 * 24 * 60 * 60;
const DETAIL_CACHE_SECONDS = 180 * 24 * 60 * 60;

function nutrientAmount(
  nutrients: unknown[],
  ids: number[],
  numbers: string[],
  unit: "kcal" | "kj" | "g",
): number | null {
  for (const id of ids) {
    for (const item of nutrients) {
      const row = object(item);
      const nested = object(row.nutrient);
      const nutrientId = number(row.nutrientId ?? nested.id);
      const nutrientNumber = text(row.nutrientNumber ?? nested.number);
      if (
        nutrientId !== id &&
        !(nutrientId === null && numbers.includes(nutrientNumber))
      )
        continue;
      const rawAmount = number(row.amount ?? row.value);
      if (rawAmount === null) continue;
      const actualUnit = text(row.unitName ?? nested.unitName).toLowerCase();
      if (actualUnit === unit) return rawAmount;
      if (unit === "g" && actualUnit === "mg") return rawAmount / 1000;
      if (unit === "g" && (actualUnit === "µg" || actualUnit === "ug"))
        return rawAmount / 1_000_000;
    }
  }
  return null;
}

function gramsForServing(food: Record<string, unknown>): number | null {
  const size = number(food.servingSize);
  if (!size || size <= 0) return null;
  const unit = text(food.servingSizeUnit).toLowerCase();
  if (unit === "g" || unit === "grm" || unit === "gram" || unit === "grams")
    return size;
  if (unit === "kg") return size * 1000;
  return null;
}

export function parseUsdaFood(payload: unknown): Food {
  const food = object(payload);
  const externalId = String(food.fdcId ?? "");
  const name = text(food.description);
  if (!/^\d+$/.test(externalId) || !name) {
    throw new ProviderError("USDA", "returned an invalid food.");
  }

  const nutrients = list(food.foodNutrients);
  const kcal = nutrientAmount(
    nutrients,
    [1008, 2048, 2047],
    ["208", "957", "958"],
    "kcal",
  );
  const kj = nutrientAmount(nutrients, [1062], ["268"], "kj");
  const values: Record<keyof Nutrients, number | null> = {
    calories: kcal ?? (kj !== null ? kj / 4.184 : null),
    protein: nutrientAmount(nutrients, [1003], ["203"], "g"),
    fat: nutrientAmount(nutrients, [1004], ["204"], "g"),
    carbs: nutrientAmount(nutrients, [1005], ["205"], "g"),
  };

  // Label nutrients are per serving; foodNutrients above are already per 100 g.
  const servingGrams = gramsForServing(food);
  if (servingGrams !== null) {
    const labels = object(food.labelNutrients);
    const keys = {
      calories: "calories",
      protein: "protein",
      fat: "fat",
      carbs: "carbohydrates",
    } as const;
    for (const key of Object.keys(keys) as (keyof Nutrients)[]) {
      const amount = number(object(labels[keys[key]]).value);
      if (values[key] === null && amount !== null)
        values[key] = (amount * 100) / servingGrams;
    }
  }

  if (!completeNutrients(values)) {
    throw new ProviderError(
      "USDA",
      "this food has incomplete calorie or macro data. Choose another result or create a custom food.",
    );
  }

  const servings: Serving[] = [];
  for (const item of list(food.foodPortions)) {
    const portion = object(item);
    const grams = number(portion.gramWeight);
    if (grams === null || grams <= 0) continue;
    const amount = number(portion.amount);
    const modifier = text(portion.modifier);
    const measure = text(object(portion.measureUnit).name);
    const description = text(portion.portionDescription);
    const unitName = modifier || (measure !== "undetermined" ? measure : "");
    const portionName =
      description || `${amount || 1} ${unitName || "serving"}`;
    servings.push({
      id: `usda-portion-${portion.id ?? servings.length}`,
      name: portionName,
      grams,
    });
  }
  if (servingGrams !== null) {
    servings.push({
      id: "usda-label-serving",
      name: text(food.householdServingFullText) || "serving",
      grams: servingGrams,
    });
  }

  return {
    id: `usda:${externalId}`,
    externalId,
    source: "usda",
    name,
    brand: text(food.brandOwner) || text(food.brandName) || null,
    ...scale(values, 1),
    servings: servings
      .filter(
        (serving, index) =>
          servings.findIndex(
            (candidate) =>
              candidate.name === serving.name &&
              rounded(candidate.grams) === rounded(serving.grams),
          ) === index,
      )
      .slice(0, 30),
  };
}

function url(path: string): URL {
  const key = process.env.USDA_FDC_API_KEY;
  if (!key) throw new ProviderError("USDA", "API key is not configured.");
  const result = new URL(`${BASE_URL}${path}`);
  result.searchParams.set("api_key", key);
  return result;
}

export async function searchUsdaFoods(
  query: string,
  page = 1,
): Promise<{ foods: Food[]; nextPage: number | null }> {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new ProviderError("USDA", "invalid search page.");
  }
  const normalized = normalizeSearchQuery(query);
  if (normalized.length < 2) return { foods: [], nextPage: null };
  return cached(
    `usda:search:v2:${normalized}:${page}`,
    SEARCH_CACHE_SECONDS * 1000,
    async () => {
      const endpoint = url("/foods/search");
      endpoint.searchParams.set("query", normalized);
      endpoint.searchParams.set("pageSize", String(PAGE_SIZE));
      endpoint.searchParams.set("pageNumber", String(page));
      // USDA applies this ordering before pagination, keeping all generic data
      // types (Survey, SR Legacy, Foundation) ahead of Branded across pages.
      endpoint.searchParams.set("sortBy", "dataType.keyword");
      endpoint.searchParams.set("sortOrder", "desc");
      const payload = object(
        await fetchJson("USDA", endpoint, {
          cache: "force-cache",
          next: { revalidate: SEARCH_CACHE_SECONDS, tags: ["usda-foods"] },
        }),
      );
      const rows = list(payload.foods);
      const foods: Food[] = [];
      for (const row of rows) {
        try {
          foods.push(parseUsdaFood(row));
        } catch {
          // A search record missing macros should not look like a zero-calorie food.
        }
      }
      const totalPages = number(payload.totalPages);
      const totalHits = number(payload.totalHits);
      const currentPage = number(payload.currentPage);
      const resolvedPage =
        currentPage !== null &&
        Number.isInteger(currentPage) &&
        currentPage >= 1
          ? currentPage
          : page;
      const hasMore =
        totalPages !== null && Number.isInteger(totalPages)
          ? resolvedPage < totalPages
          : totalHits !== null
            ? resolvedPage * PAGE_SIZE < totalHits
            : rows.length >= PAGE_SIZE;
      // Use provider metadata or the raw record count, never the parsed count:
      // incomplete foods on one page must not hide usable foods on later pages.
      return { foods, nextPage: hasMore ? page + 1 : null };
    },
  );
}

export async function resolveUsdaFood(externalId: string): Promise<Food> {
  return cached(
    `usda:food:${externalId}`,
    DETAIL_CACHE_SECONDS * 1000,
    async () => {
      return parseUsdaFood(
        await fetchJson("USDA", url(`/food/${externalId}`), {
          cache: "force-cache",
          next: { revalidate: DETAIL_CACHE_SECONDS, tags: ["usda-foods"] },
        }),
      );
    },
  );
}
