import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  dayCompletions,
  foods,
  meals,
  measurements,
  recipes,
} from "@/lib/db/schema";
import { addDays, daysBefore, todayInTashkent } from "@/lib/dates";
import { HttpError } from "@/lib/http";
import {
  calculateTargets,
  scaleNutrients,
  summarize,
  sumNutrients,
} from "@/lib/nutrition";
import { resolveExternalFood } from "@/lib/providers";
import type {
  Bootstrap,
  Dashboard,
  DayStat,
  Food,
  Meal,
  MealEntry,
  Measurement,
  Recipe,
} from "@/lib/types";
import type {
  customFoodSchema,
  mealSchema,
  foodEntrySchema,
  recipeSchema,
  measurementSchema,
} from "@/lib/validation";

function measurementDto(row: typeof measurements.$inferSelect): Measurement {
  const { accountId: _accountId, ...value } = row;
  return { ...value, createdAt: row.createdAt.toISOString() };
}

function foodDto(row: typeof foods.$inferSelect): Food {
  return {
    id: row.id,
    source: row.source,
    externalId: row.externalId,
    name: row.name,
    brand: row.brand,
    calories: row.calories,
    protein: row.protein,
    fat: row.fat,
    carbs: row.carbs,
    servings: row.servings,
  };
}

function mealDto(row: typeof meals.$inferSelect): Meal {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    entries: row.entries,
    createdAt: row.createdAt.toISOString(),
    ...sumNutrients(row.entries),
  };
}

export async function getBootstrap(accountId: string): Promise<Bootstrap> {
  const today = todayInTashkent();
  const [first, latest] = await Promise.all([
    getDb()
      .select()
      .from(measurements)
      .where(eq(measurements.accountId, accountId))
      .orderBy(asc(measurements.effectiveDate), asc(measurements.createdAt))
      .limit(1),
    getDb()
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.accountId, accountId),
          lte(measurements.effectiveDate, today),
        ),
      )
      .orderBy(desc(measurements.effectiveDate), desc(measurements.createdAt))
      .limit(1),
  ]);
  return {
    today,
    startDate: first[0]?.effectiveDate ?? null,
    measurement: latest[0] ? measurementDto(latest[0]) : null,
  };
}

export async function assertDateInRange(accountId: string, date: string) {
  const bootstrap = await getBootstrap(accountId);
  if (!bootstrap.startDate)
    throw new HttpError(409, "Add initial measurements first.");
  if (date < bootstrap.startDate || date > bootstrap.today) {
    throw new HttpError(
      400,
      "Choose a date from your start date through today.",
    );
  }
  return bootstrap;
}

export async function saveMeasurement(
  accountId: string,
  input: z.infer<typeof measurementSchema>,
) {
  const bootstrap = await getBootstrap(accountId);
  if (
    input.effectiveDate > bootstrap.today ||
    (bootstrap.startDate && input.effectiveDate < bootstrap.startDate)
  ) {
    throw new HttpError(
      400,
      "Measurement date must be within your tracking dates.",
    );
  }
  if (!bootstrap.startDate && input.effectiveDate !== bootstrap.today) {
    throw new HttpError(400, "Initial measurements must start today.");
  }
  if (!bootstrap.startDate && input.targetWeightKg >= input.weightKg) {
    throw new HttpError(
      400,
      "Target weight must be below current weight to start a weight-loss plan.",
    );
  }
  if (bootstrap.startDate && input.targetWeightKg > input.weightKg) {
    const [effective] = await getDb()
      .select({ targetWeightKg: measurements.targetWeightKg })
      .from(measurements)
      .where(
        and(
          eq(measurements.accountId, accountId),
          lte(measurements.effectiveDate, input.effectiveDate),
        ),
      )
      .orderBy(desc(measurements.effectiveDate), desc(measurements.createdAt))
      .limit(1);
    if (input.targetWeightKg !== effective?.targetWeightKg) {
      throw new HttpError(400, "Choose a target at or below current weight.");
    }
  }
  let targets: ReturnType<typeof calculateTargets>;
  try {
    targets = calculateTargets(input);
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error
        ? error.message
        : "Unable to calculate targets for these measurements.",
    );
  }
  const [row] = await getDb()
    .insert(measurements)
    .values({ accountId, ...input, ...targets })
    .returning();
  return measurementDto(row);
}

export async function getDashboard(
  accountId: string,
  date: string,
): Promise<Dashboard> {
  const bootstrap = await assertDateInRange(accountId, date);
  const startDate = bootstrap.startDate!;
  const from = addDays(date, -7);
  const [measurementRows, mealRows, completionRows] = await Promise.all([
    getDb()
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.accountId, accountId),
          lte(measurements.effectiveDate, date),
        ),
      )
      .orderBy(desc(measurements.effectiveDate), desc(measurements.createdAt)),
    getDb()
      .select()
      .from(meals)
      .where(
        and(
          eq(meals.accountId, accountId),
          gte(meals.date, from),
          lte(meals.date, date),
        ),
      )
      .orderBy(asc(meals.createdAt), asc(meals.id)),
    getDb()
      .select()
      .from(dayCompletions)
      .where(
        and(
          eq(dayCompletions.accountId, accountId),
          gte(dayCompletions.date, from),
          lte(dayCompletions.date, date),
        ),
      ),
  ]);
  const measurement = measurementDto(measurementRows[0]);
  const history: DayStat[] = [...daysBefore(date, 7), date]
    .filter((day) => day >= startDate)
    .map((day) => {
      const effective = measurementRows.find(
        (row) => row.effectiveDate <= day,
      )!;
      const nutrients = sumNutrients(
        mealRows
          .filter((meal) => meal.date === day)
          .flatMap((meal) => meal.entries),
      );
      const completed = completionRows.some(
        (row) => row.date === day && row.completed,
      );
      return {
        date: day,
        ...nutrients,
        maintenance: effective.maintenance,
        mild: effective.mild,
        steady: effective.steady,
        extreme: effective.extreme,
        completed,
        eligible:
          day < date && (completed || nutrients.calories > effective.extreme),
      };
    });
  return {
    date,
    today: bootstrap.today,
    startDate,
    measurement,
    meals: mealRows.filter((meal) => meal.date === date).map(mealDto),
    completed: completionRows.some((row) => row.date === date && row.completed),
    history,
    summary: summarize(history, measurement, date),
  };
}

function foodSearchCondition(query: string) {
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  return or(
    ilike(foods.name, `%${escaped}%`),
    ilike(foods.brand, `%${escaped}%`),
    sql`word_similarity(lower(${query}), lower(${foods.name})) > 0.3`,
  )!;
}

export async function listRecentFoods(
  accountId: string,
  query: string,
  page = 1,
) {
  const q = query.trim().slice(0, 120);
  const entry = sql`logged_entry.value`;
  const foodId = sql<string>`${entry}->>'foodId'`;
  // Deduplicate before paging. Meal dates define the latest intake; editing an
  // older meal must not replace a later day's portion. Last occurrence wins
  // when the same food appears more than once in a meal.
  const latest = getDb()
    .selectDistinctOn([foodId], {
      foodId: foodId.as("food_id"),
      grams: sql<number>`(${entry}->>'grams')::double precision`.as("grams"),
      quantity: sql<number>`(${entry}->>'quantity')::double precision`.as(
        "quantity",
      ),
      servingName: sql<string>`${entry}->>'servingName'`.as("serving_name"),
      date: meals.date,
      createdAt: meals.createdAt,
      position: sql<number>`logged_entry.position`.as("position"),
    })
    .from(meals)
    .crossJoin(
      sql`jsonb_array_elements(${meals.entries}) with ordinality as logged_entry(value, position)`,
    )
    .where(eq(meals.accountId, accountId))
    .orderBy(
      foodId,
      desc(meals.date),
      desc(meals.createdAt),
      desc(meals.id),
      desc(sql`logged_entry.position`),
    )
    .as("latest_entries");
  const rows = await getDb()
    .select({
      food: foods,
      grams: latest.grams,
      quantity: latest.quantity,
      servingName: latest.servingName,
    })
    .from(foods)
    .innerJoin(latest, eq(foods.id, sql`${latest.foodId}::uuid`))
    .where(
      and(
        eq(foods.accountId, accountId),
        eq(foods.archived, false),
        q ? foodSearchCondition(q) : undefined,
      ),
    )
    .orderBy(
      desc(latest.date),
      desc(latest.createdAt),
      desc(latest.position),
      asc(foods.id),
    )
    .limit(21)
    .offset((page - 1) * 20);
  return {
    foods: rows.slice(0, 20).map(({ food, grams, quantity, servingName }) => ({
      ...foodDto(food),
      lastEntry: { grams, quantity, servingName },
    })),
    nextPage: rows.length > 20 ? page + 1 : null,
    warnings: [],
  };
}

export async function listFoods(
  accountId: string,
  query: string,
  customOnly: boolean,
  page = 1,
) {
  const q = query.trim().slice(0, 120);
  const conditions = [
    eq(foods.accountId, accountId),
    eq(foods.archived, false),
  ];
  if (customOnly) conditions.push(eq(foods.source, "custom"));
  if (q) {
    // Escape LIKE metacharacters, retaining indexed trigram fuzzy matches for misspellings.
    conditions.push(foodSearchCondition(q));
  }
  const rows = await getDb()
    .select()
    .from(foods)
    .where(and(...conditions))
    .orderBy(
      ...(q
        ? [
            asc(sql`case when ${foods.brand} is null then 0 else 1 end`),
            desc(sql`similarity(lower(${foods.name}), lower(${q}))`),
          ]
        : []),
      sql`${foods.lastUsedAt} desc nulls last`,
      desc(foods.updatedAt),
      asc(foods.name),
      asc(foods.id),
    )
    .limit(21)
    .offset((page - 1) * 20);
  return {
    foods: rows.slice(0, 20).map(foodDto),
    nextPage: rows.length > 20 ? page + 1 : null,
    warnings: [],
  };
}

export async function getCustomFood(
  accountId: string,
  id: string,
): Promise<Food> {
  const [row] = await getDb()
    .select()
    .from(foods)
    .where(
      and(
        eq(foods.id, id),
        eq(foods.accountId, accountId),
        eq(foods.source, "custom"),
        eq(foods.archived, false),
      ),
    )
    .limit(1);
  if (!row) throw new HttpError(404, "Food not found.");
  return foodDto(row);
}

export async function saveCustomFood(
  accountId: string,
  input: z.infer<typeof customFoodSchema>,
  id?: string,
) {
  if (id) {
    const [row] = await getDb()
      .update(foods)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(foods.id, id),
          eq(foods.accountId, accountId),
          eq(foods.source, "custom"),
          eq(foods.archived, false),
        ),
      )
      .returning();
    if (!row) throw new HttpError(404, "Custom food not found.");
    return foodDto(row);
  }
  const [row] = await getDb()
    .insert(foods)
    .values({ accountId, source: "custom", ...input })
    .returning();
  return foodDto(row);
}

export async function deleteCustomFood(accountId: string, id: string) {
  const [row] = await getDb()
    .update(foods)
    .set({ archived: true, updatedAt: new Date() })
    .where(
      and(
        eq(foods.id, id),
        eq(foods.accountId, accountId),
        eq(foods.source, "custom"),
      ),
    )
    .returning({ id: foods.id });
  if (!row) throw new HttpError(404, "Custom food not found.");
}

export async function getResolvedFood(
  accountId: string,
  source: "usda",
  externalId: string,
): Promise<Food> {
  const [existing] = await getDb()
    .select()
    .from(foods)
    .where(
      and(
        eq(foods.accountId, accountId),
        eq(foods.source, source),
        eq(foods.externalId, externalId),
      ),
    )
    .limit(1);
  if (existing) return foodDto(existing);
  try {
    return await resolveExternalFood(source, externalId);
  } catch (error) {
    throw new HttpError(
      502,
      error instanceof Error ? error.message : "Food details are unavailable.",
    );
  }
}

async function canonicalFood(
  accountId: string,
  ref: z.infer<typeof foodEntrySchema>["food"],
): Promise<Food> {
  const uuid = z.uuid().safeParse(ref.id);
  if (uuid.success) {
    const [row] = await getDb()
      .select()
      .from(foods)
      .where(
        and(
          eq(foods.id, uuid.data),
          eq(foods.accountId, accountId),
          eq(foods.archived, false),
        ),
      )
      .limit(1);
    if (row) return foodDto(row);
  }
  if (ref.source === "custom" || !ref.externalId)
    throw new HttpError(404, "Food not found. Add it again.");
  const resolved = await getResolvedFood(accountId, ref.source, ref.externalId);
  const [row] = await getDb()
    .insert(foods)
    .values({
      accountId,
      source: resolved.source,
      externalId: resolved.externalId,
      name: resolved.name,
      brand: resolved.brand,
      calories: resolved.calories,
      protein: resolved.protein,
      fat: resolved.fat,
      carbs: resolved.carbs,
      servings: resolved.servings,
    })
    .onConflictDoUpdate({
      target: [foods.accountId, foods.source, foods.externalId],
      set: { lastUsedAt: new Date() },
    })
    .returning();
  return foodDto(row);
}

async function canonicalEntries(
  accountId: string,
  input: z.infer<typeof foodEntrySchema>[],
  existing: MealEntry[] = [],
  foodCache = new Map<string, Food>(),
): Promise<MealEntry[]> {
  const entries: MealEntry[] = [];
  const usedIds = new Set<string>();
  for (const entry of input) {
    if (entry.id && usedIds.has(entry.id))
      throw new HttpError(400, "Duplicate entry.");
    if (entry.id) usedIds.add(entry.id);
    const original = existing.find(
      (item) =>
        !item.recipe && item.id === entry.id && item.food.id === entry.food.id,
    );
    let food = original?.food ?? foodCache.get(entry.food.id);
    if (!food) {
      food = await canonicalFood(accountId, entry.food);
      foodCache.set(entry.food.id, food);
    }
    entries.push({
      id: original?.id ?? randomUUID(),
      foodId: food.id,
      food,
      grams: entry.grams,
      quantity: entry.quantity,
      servingName: entry.servingName,
      ...scaleNutrients(food, entry.grams),
    });
  }
  return entries;
}

function recipeDto(row: typeof recipes.$inferSelect): Recipe {
  return {
    id: row.id,
    name: row.name,
    entries: row.entries,
    ...sumNutrients(row.entries),
  };
}

export async function listRecipes(accountId: string, query: string, page = 1) {
  const q = query
    .trim()
    .slice(0, 120)
    .replace(/[\\%_]/g, "\\$&");
  const rows = await getDb()
    .select()
    .from(recipes)
    .where(
      and(
        eq(recipes.accountId, accountId),
        eq(recipes.archived, false),
        q ? ilike(recipes.name, `%${q}%`) : undefined,
      ),
    )
    .orderBy(asc(recipes.name), asc(recipes.id))
    .limit(21)
    .offset((page - 1) * 20);
  return {
    recipes: rows.slice(0, 20).map(recipeDto),
    nextPage: rows.length > 20 ? page + 1 : null,
  };
}

export async function getRecipe(
  accountId: string,
  id: string,
): Promise<Recipe> {
  const [row] = await getDb()
    .select()
    .from(recipes)
    .where(
      and(
        eq(recipes.id, id),
        eq(recipes.accountId, accountId),
        eq(recipes.archived, false),
      ),
    )
    .limit(1);
  if (!row) throw new HttpError(404, "Recipe not found.");
  return recipeDto(row);
}

export async function saveRecipe(
  accountId: string,
  input: z.infer<typeof recipeSchema>,
) {
  const existing = input.id ? await getRecipe(accountId, input.id) : undefined;
  const entries = await canonicalEntries(
    accountId,
    input.entries,
    existing?.entries,
  );
  const [row] = existing
    ? await getDb()
        .update(recipes)
        .set({ name: input.name, entries, updatedAt: new Date() })
        .where(
          and(
            eq(recipes.id, existing.id),
            eq(recipes.accountId, accountId),
            eq(recipes.archived, false),
          ),
        )
        .returning()
    : await getDb()
        .insert(recipes)
        .values({ accountId, name: input.name, entries })
        .returning();
  if (!row) throw new HttpError(404, "Recipe not found.");
  return recipeDto(row);
}

export async function deleteRecipe(accountId: string, id: string) {
  const [row] = await getDb()
    .update(recipes)
    .set({ archived: true, updatedAt: new Date() })
    .where(
      and(
        eq(recipes.id, id),
        eq(recipes.accountId, accountId),
        eq(recipes.archived, false),
      ),
    )
    .returning({ id: recipes.id });
  if (!row) throw new HttpError(404, "Recipe not found.");
}

export async function saveMeal(
  accountId: string,
  input: z.infer<typeof mealSchema>,
) {
  await assertDateInRange(accountId, input.date);
  const [existing] = input.id
    ? await getDb()
        .select()
        .from(meals)
        .where(and(eq(meals.id, input.id), eq(meals.accountId, accountId)))
        .limit(1)
    : [];
  if (input.id && !existing) throw new HttpError(404, "Meal not found.");
  const entries: MealEntry[] = [];
  const usedIds = new Set<string>();
  const foodCache = new Map<string, Food>();
  for (const entry of input.entries) {
    if (entry.id && usedIds.has(entry.id))
      throw new HttpError(400, "Duplicate entry.");
    if (entry.id) usedIds.add(entry.id);
    if ("recipeId" in entry) {
      const original = existing?.entries.filter(
        (item) =>
          entry.id &&
          item.recipe?.id === entry.id &&
          item.recipe?.recipeId === entry.recipeId,
      );
      if (original?.length) {
        entries.push(...original);
      } else {
        const recipe = await getRecipe(accountId, entry.recipeId);
        const group = {
          id: randomUUID(),
          recipeId: recipe.id,
          name: recipe.name,
        };
        entries.push(
          ...recipe.entries.map((item) => ({
            ...item,
            id: randomUUID(),
            recipe: group,
          })),
        );
      }
    } else {
      if (
        existing?.entries.some((item) => item.id === entry.id && item.recipe)
      ) {
        throw new HttpError(
          400,
          "Manage recipe ingredients in the recipe library.",
        );
      }
      entries.push(
        ...(await canonicalEntries(
          accountId,
          [entry],
          existing?.entries,
          foodCache,
        )),
      );
    }
    if (entries.length > 1000)
      throw new HttpError(400, "A meal can contain up to 1,000 foods.");
  }
  // One atomic row contains the complete meal and its immutable entry snapshots.
  const [row] = existing
    ? await getDb()
        .update(meals)
        .set({
          date: input.date,
          name: input.name,
          entries,
          updatedAt: new Date(),
        })
        .where(and(eq(meals.id, existing.id), eq(meals.accountId, accountId)))
        .returning()
    : await getDb()
        .insert(meals)
        .values({ accountId, date: input.date, name: input.name, entries })
        .returning();
  const ids = [...new Set(entries.map((entry) => entry.foodId))];
  // Recency is advisory; a recency update failure must not report a committed meal as unsaved.
  await Promise.all(
    ids.map((id) =>
      getDb()
        .update(foods)
        .set({ lastUsedAt: new Date() })
        .where(and(eq(foods.id, id), eq(foods.accountId, accountId))),
    ),
  ).catch(() => undefined);
  return mealDto(row);
}

export async function deleteMeal(accountId: string, id: string) {
  const [row] = await getDb()
    .delete(meals)
    .where(and(eq(meals.id, id), eq(meals.accountId, accountId)))
    .returning({ id: meals.id });
  if (!row) throw new HttpError(404, "Meal not found.");
}

export async function setDayCompleted(
  accountId: string,
  date: string,
  completed: boolean,
) {
  await assertDateInRange(accountId, date);
  await getDb()
    .insert(dayCompletions)
    .values({ accountId, date, completed })
    .onConflictDoUpdate({
      target: [dayCompletions.accountId, dayCompletions.date],
      set: { completed },
    });
}
