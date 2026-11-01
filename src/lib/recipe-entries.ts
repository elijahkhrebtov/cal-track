import type { MealEntry, Recipe } from "@/lib/types";

// Keep ingredient snapshots flat for nutrition and food recency. A group is one
// immutable recipe occurrence; adding the same recipe twice creates two groups.
export function groupEntries(entries: MealEntry[]): MealEntry[][] {
  const groups: MealEntry[][] = [];
  const recipes = new Map<string, MealEntry[]>();
  for (const entry of entries) {
    if (!entry.recipe) {
      groups.push([entry]);
      continue;
    }
    let group = recipes.get(entry.recipe.id);
    if (!group) {
      group = [];
      recipes.set(entry.recipe.id, group);
      groups.push(group);
    }
    group.push(entry);
  }
  return groups;
}

export function entryReferences(entries: MealEntry[]) {
  return groupEntries(entries).map(([entry]) =>
    entry.recipe
      ? { id: entry.recipe.id, recipeId: entry.recipe.recipeId }
      : {
          id: entry.id,
          food: entry.food,
          grams: entry.grams,
          quantity: entry.quantity,
          servingName: entry.servingName,
        },
  );
}

export function recipeDraftEntries(
  recipe: Recipe,
  makeId: () => string,
): MealEntry[] {
  const group = { id: makeId(), recipeId: recipe.id, name: recipe.name };
  return recipe.entries.map((entry) => ({
    ...entry,
    id: makeId(),
    recipe: group,
  }));
}
