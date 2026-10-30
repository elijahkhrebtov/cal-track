import "server-only";

import type { Food } from "../types";
import { ProviderError, uniqueFoods } from "./common";
import { resolveUsdaFood, searchUsdaFoods } from "./usda";

export async function searchExternalFoods(
  query: string,
): Promise<{ foods: Food[]; warnings: string[] }> {
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 120);
  if (normalized.length < 2) return { foods: [], warnings: [] };
  try {
    const foods = await searchUsdaFoods(normalized);
    return { foods: uniqueFoods(foods), warnings: [] };
  } catch (error) {
    return {
      foods: [],
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
