import type { Food, Nutrients } from "../types";

export type JsonObject = Record<string, unknown>;

export function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

export function number(value: unknown): number | null {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function rounded(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function completeNutrients(
  values: Record<keyof Nutrients, number | null>,
): values is Nutrients {
  return Object.values(values).every((value) => value !== null);
}

export function scale(values: Nutrients, multiplier: number): Nutrients {
  return {
    calories: rounded(values.calories * multiplier),
    protein: rounded(values.protein * multiplier),
    fat: rounded(values.fat * multiplier),
    carbs: rounded(values.carbs * multiplier),
  };
}

export function uniqueFoods(foods: Food[]): Food[] {
  return [...new Map(foods.map((food) => [food.id, food])).values()];
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 120).trim();
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: "USDA",
    message: string,
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
  }
}
