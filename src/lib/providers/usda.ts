import type { Food, Nutrients, Serving } from "../types";
import { cached } from "./cache";
import {
  completeNutrients,
  list,
  number,
  object,
  ProviderError,
  rounded,
  scale,
  text,
} from "./common";
import { fetchJson } from "./http";

const BASE_URL = "https://api.nal.usda.gov/fdc/v1";

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

export async function searchUsdaFoods(query: string): Promise<Food[]> {
  return cached(`usda:search:${query.toLowerCase()}`, 15 * 60_000, async () => {
    const endpoint = url("/foods/search");
    endpoint.searchParams.set("query", query);
    endpoint.searchParams.set("pageSize", "15");
    endpoint.searchParams.set("pageNumber", "1");
    const payload = object(await fetchJson("USDA", endpoint));
    const foods: Food[] = [];
    for (const row of list(payload.foods)) {
      try {
        foods.push(parseUsdaFood(row));
      } catch {
        // A search record missing macros should not look like a zero-calorie food.
      }
    }
    return foods;
  });
}

export async function resolveUsdaFood(externalId: string): Promise<Food> {
  return cached(`usda:food:${externalId}`, 24 * 60 * 60_000, async () => {
    return parseUsdaFood(await fetchJson("USDA", url(`/food/${externalId}`)));
  });
}
