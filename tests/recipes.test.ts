import { describe, expect, it } from "vitest";
import {
  entryReferences,
  groupEntries,
  recipeDraftEntries,
} from "../src/lib/recipe-entries";
import { mealSchema, recipeSchema } from "../src/lib/validation";
import type { MealEntry, Recipe } from "../src/lib/types";

const food = {
  id: "beef",
  name: "Beef",
  source: "custom" as const,
  externalId: null,
  brand: null,
  calories: 200,
  protein: 20,
  fat: 10,
  carbs: 0,
  servings: [],
};
const entry: MealEntry = {
  id: "ingredient",
  foodId: food.id,
  food,
  grams: 50,
  quantity: 50,
  servingName: "g",
  calories: 100,
  protein: 10,
  fat: 5,
  carbs: 0,
};
const recipe: Recipe = {
  id: "8c7f0852-8b83-489e-8c67-057288ac6fbc",
  name: "Lunch",
  entries: [entry, { ...entry, id: "second" }],
  calories: 200,
  protein: 20,
  fat: 10,
  carbs: 0,
};

describe("recipe occurrences", () => {
  it("keeps repeated additions distinct and serializes each whole recipe once", () => {
    let id = 0;
    const makeId = () => String(++id);
    const first = recipeDraftEntries(recipe, makeId);
    const second = recipeDraftEntries(recipe, makeId);
    const entries = [entry, ...first, ...second];
    expect(new Set(entries.map((item) => item.id)).size).toBe(5);
    expect(groupEntries(entries)).toEqual([[entry], first, second]);
    expect(entryReferences(entries)).toEqual([
      { id: entry.id, food, grams: 50, quantity: 50, servingName: "g" },
      { id: first[0].recipe!.id, recipeId: recipe.id },
      { id: second[0].recipe!.id, recipeId: recipe.id },
    ]);
    expect(recipe.entries[0].recipe).toBeUndefined();
    expect(
      mealSchema.safeParse({
        name: "Dinner",
        date: "2026-11-01",
        entries: entryReferences(entries),
      }).success,
    ).toBe(true);
  });

  it("rejects empty recipes, nested recipes, and attempts to adjust recipe quantities", () => {
    expect(recipeSchema.safeParse({ name: "Empty", entries: [] }).success).toBe(
      false,
    );
    expect(
      recipeSchema.safeParse({
        name: "Nested",
        entries: [{ recipeId: recipe.id }],
      }).success,
    ).toBe(false);
    expect(
      mealSchema.safeParse({
        name: "Dinner",
        date: "2026-11-01",
        entries: [{ recipeId: recipe.id, grams: 20 }],
      }).success,
    ).toBe(false);
  });
});
