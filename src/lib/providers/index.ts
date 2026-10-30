import "server-only";

import type { Food, FoodSearchPage } from "../types";
import { normalizeSearchQuery, ProviderError, uniqueFoods } from "./common";
import { resolveUsdaFood, searchUsdaFoods } from "./usda";

export async function searchExternalFoods(
  query: string,
  page = 1,
): Promise<FoodSearchPage> {
  const normalized = normalizeSearchQuery(query);
  if (normalized.length < 2) return { foods: [], warnings: [], nextPage: null };
  try {
    const result = await searchUsdaFoods(normalized, page);
    return { ...result, foods: uniqueFoods(result.foods), warnings: [] };
  } catch (error) {
    return {
      foods: [],
      nextPage: null,
      warnings: [
        error instanceof ProviderError
          ? error.message
          : "USDA: search is temporarily unavailable.",
      ],
    };
  }
}

export async function resolveExternalFood(
  source: "usda",
  externalId: string,
): Promise<Food> {
  if (!/^\d{1,20}$/.test(externalId))
    throw new Error("Invalid external food identifier.");
  if (source === "usda") return resolveUsdaFood(externalId);
  throw new Error("Unsupported food source.");
}
