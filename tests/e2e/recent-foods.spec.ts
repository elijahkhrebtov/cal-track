import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { test, expect } from "./fixtures";
import { accounts, foods, meals } from "../../src/lib/db/schema";
import { addDays } from "../../src/lib/dates";
import type {
  Dashboard,
  Food,
  FoodSearchPage,
  Meal,
} from "../../src/lib/types";

const foodInput = {
  name: "Chicken breast",
  calories: 100,
  protein: 20,
  fat: 2,
  carbs: 0,
  servings: [] as Food["servings"],
};

async function createFood(request: APIRequestContext, input = foodInput) {
  const response = await request.post("/api/foods", { data: input });
  expect(response.status()).toBe(201);
  return (await response.json()) as Food;
}

async function saveMeal(
  request: APIRequestContext,
  date: string,
  entries: {
    food: Food;
    grams: number;
    quantity: number;
    servingName: string;
  }[],
) {
  const response = await request.post("/api/meals", {
    data: { date, name: "Previous intake", entries },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as Meal;
}

test("recent portions select the latest intake once, prefill units, and create a new current-nutrition entry", async ({
  page,
  account,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined });
  });
  const chicken = await createFood(page.request);
  const yogurt = await createFood(page.request, {
    ...foodInput,
    name: "Greek yogurt",
    calories: 60,
    servings: [{ id: "bowl", name: "bowl", grams: 150 }],
  });
  const yesterday = addDays(account.today, -1);
  const older = await saveMeal(page.request, yesterday, [
    { food: chicken, grams: 300, quantity: 300, servingName: "g" },
  ]);
  const latest = await saveMeal(page.request, account.today, [
    { food: chicken, grams: 100, quantity: 100, servingName: "g" },
    { food: chicken, grams: 150, quantity: 150, servingName: "g" },
    { food: yogurt, grams: 225, quantity: 1.5, servingName: "bowl" },
  ]);
  // A later save of an older day's meal does not replace the latest intake.
  expect(
    (
      await page.request.post("/api/meals", {
        data: {
          ...older,
          entries: [{ ...older.entries[0], grams: 400, quantity: 400 }],
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch(`/api/foods/${yogurt.id}`, {
        data: { ...yogurt, calories: 120 },
      })
    ).status(),
  ).toBe(200);
  const response = await page.request.get("/api/foods?recent=true");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const recent = (await response.json()) as FoodSearchPage;
  expect(recent.foods).toHaveLength(2);
  expect(
    recent.foods.find((food) => food.id === chicken.id)?.lastEntry,
  ).toEqual({
    grams: 150,
    quantity: 150,
    servingName: "g",
  });
  expect(recent.foods.find((food) => food.id === yogurt.id)).toMatchObject({
    calories: 120,
    lastEntry: { grams: 225, quantity: 1.5, servingName: "bowl" },
  });

  await page.goto("/meals/new");
  await page.getByLabel("Meal name").fill("Repeat portion");
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Recent", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Search foods")).not.toBeFocused();
  const chickenRow = page.getByRole("button", {
    name: /Chicken breast.*150 g/,
  });
  const yogurtRow = page.getByRole("button", {
    name: /Greek yogurt.*1.5 bowl.*225 g/,
  });
  await expect(chickenRow).toHaveCount(1);
  await expect(yogurtRow).toBeVisible();
  await page.screenshot({ path: "test-results/recent-foods-mobile.png" });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({ path: "test-results/recent-foods-small-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: "test-results/recent-foods-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Search foods").fill("chiken");
  await expect(chickenRow).toBeVisible();
  await expect(yogurtRow).toHaveCount(0);
  await chickenRow.click();
  await expect(page.getByLabel("Amount")).toHaveValue("150");
  await expect(page.getByLabel("Unit")).toHaveValue("g");
  await page.goBack();
  await page.getByRole("button", { name: "Clear search" }).click();
  await yogurtRow.click();
  await expect(page.getByLabel("Amount")).toHaveValue("1.5");
  await expect(page.getByLabel("Unit")).toHaveValue("bowl");
  await page.getByLabel("Amount").fill("2");
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "Recent", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.getByLabel("Amount")).toHaveValue("2");
  await page.getByRole("button", { name: "Add to meal", exact: true }).click();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  const dashboard = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  const added = dashboard.meals.find((meal) => meal.name === "Repeat portion")!;
  expect(added.entries[0]).toMatchObject({
    foodId: yogurt.id,
    grams: 300,
    quantity: 2,
    servingName: "bowl",
    calories: 360,
    food: { calories: 120 },
  });
  expect(added.entries[0].id).not.toBe(latest.entries[2].id);
  expect(
    dashboard.meals.find((meal) => meal.id === latest.id)?.entries[2].food
      .calories,
  ).toBe(60);
  await page.getByRole("button", { name: /Repeat portion/ }).click();
  await page.getByRole("button", { name: "Delete meal", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await expect(yogurtRow).toBeVisible();
  // A removed serving still repeats the recorded mass rather than guessing a conversion.
  expect(
    (
      await page.request.patch(`/api/foods/${yogurt.id}`, {
        data: { ...yogurt, calories: 120, servings: [] },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await yogurtRow.click();
  await expect(page.getByLabel("Amount")).toHaveValue("225");
  await expect(page.getByLabel("Unit")).toHaveValue("g");
});

test("search scopes separate recent entries, all saved foods, and USDA with cached resolution", async ({
  page,
  account,
}) => {
  const custom = await createFood(page.request, {
    ...foodInput,
    name: "Unlogged pear",
  });
  const db = drizzle(neon(process.env.NEON_PG_CONNECTION_STRING!));
  const [imported] = await db
    .insert(foods)
    .values({
      accountId: account.id,
      source: "usda",
      externalId: "42",
      name: "Saved pear",
      calories: 60,
      protein: 1,
      fat: 0,
      carbs: 14,
    })
    .returning();
  let requests = 0;
  await page.route("**/api/foods/search?**", (route) => {
    requests++;
    const result = {
      ...custom,
      source: "usda",
      externalId: "42",
      id: "usda:42",
      name: "Global pear",
    };
    return route.fulfill({
      json: { foods: [result, result], nextPage: null, warnings: [] },
    });
  });
  await page.goto("/meals/new/search");
  await expect(
    page.getByText("Foods from saved meals appear here."),
  ).toBeVisible();
  await page.getByLabel("Search foods").fill("pear");
  await expect(page.getByText("No matches.", { exact: true })).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("tab", { name: "My foods", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Unlogged pear.*Custom/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Saved pear.*USDA/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Unlogged pear.*Custom/ }).click();
  await expect(page.getByLabel("Amount")).toHaveValue("100");
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "My foods", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(requests).toBe(0);
  await page.getByRole("tab", { name: "My foods", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Food database", exact: true }),
  ).toBeFocused();
  const global = page.getByRole("button", { name: /Global pear.*USDA/ });
  await expect(global).toHaveCount(1);
  expect(requests).toBe(1);
  await global.click();
  await expect(
    page.getByRole("heading", { name: "Saved pear", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Amount")).toHaveValue("100");
  await page.goBack();
  await global.click();
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Add to meal", exact: true }).click();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  const dashboard = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(dashboard.meals[0].entries[0].foodId).toBe(imported.id);
  const all = (await (
    await page.request.get("/api/foods")
  ).json()) as FoodSearchPage;
  expect(all.foods).toHaveLength(2);
});

test("quick add stays in search, repeats portions in the draft, and preserves saved entry snapshots", async ({
  page,
  account,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  const chicken = await createFood(page.request);
  const yogurt = await createFood(page.request, {
    ...foodInput,
    name: "Greek yogurt",
    calories: 60,
    servings: [{ id: "bowl", name: "bowl", grams: 150 }],
  });
  const yesterday = addDays(account.today, -1);
  const original = await saveMeal(page.request, yesterday, [
    { food: chicken, grams: 100, quantity: 100, servingName: "g" },
  ]);
  const latest = await saveMeal(page.request, account.today, [
    { food: chicken, grams: 150, quantity: 150, servingName: "g" },
    { food: yogurt, grams: 225, quantity: 1.5, servingName: "bowl" },
  ]);
  expect(
    (
      await page.request.patch(`/api/foods/${chicken.id}`, {
        data: { ...chicken, calories: 200 },
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/meals/${original.id}?date=${yesterday}`);
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Quick add Greek yogurt", exact: true }),
  ).toBeVisible();
  const searchUrl = page.url();
  await page.screenshot({ path: "test-results/recent-quick-add-mobile.png" });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({
    path: "test-results/recent-quick-add-small-mobile.png",
  });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: "test-results/recent-quick-add-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Quick add Greek yogurt", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Added Greek yogurt to meal.",
  );
  await expect(page).toHaveURL(searchUrl);
  await page.getByLabel("Search foods").fill("chicken");
  const quickChicken = page.getByRole("button", {
    name: "Quick add Chicken breast",
    exact: true,
  });
  await quickChicken.click();
  await quickChicken.click();
  await expect(page).toHaveURL(searchUrl);
  await expect(page.getByLabel("Search foods")).toHaveValue("chicken");
  const unchanged = (await (
    await page.request.get(`/api/dashboard?date=${yesterday}`)
  ).json()) as Dashboard;
  expect(
    unchanged.meals.find((meal) => meal.id === original.id)?.entries,
  ).toEqual(original.entries);
  await page.goBack();
  await expect(
    page.getByRole("button", { name: /Chicken breast.*150 g/ }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: /Greek yogurt.*1.5 bowl.*225 g/ }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("Search foods")).toHaveValue("chicken");
  await page.goBack();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  const saved = (await (
    await page.request.get(`/api/dashboard?date=${yesterday}`)
  ).json()) as Dashboard;
  const updated = saved.meals.find((meal) => meal.id === original.id)!;
  expect(updated.entries).toHaveLength(4);
  expect(updated.entries[0]).toEqual(original.entries[0]);
  expect(updated.entries[1]).toMatchObject({
    foodId: yogurt.id,
    grams: 225,
    quantity: 1.5,
    servingName: "bowl",
    calories: 135,
  });
  for (const entry of updated.entries.slice(2)) {
    expect(entry).toMatchObject({
      foodId: chicken.id,
      grams: 150,
      quantity: 150,
      servingName: "g",
      calories: 300,
      food: { calories: 200 },
    });
  }
  expect(new Set(updated.entries.map((entry) => entry.id)).size).toBe(4);
  expect(
    updated.entries
      .slice(1)
      .every((entry) => !latest.entries.some((old) => old.id === entry.id)),
  ).toBe(true);

  // A changed serving must still repeat the mass displayed in Recent.
  expect(
    (
      await page.request.patch(`/api/foods/${yogurt.id}`, {
        data: {
          ...yogurt,
          servings: [{ id: "bowl", name: "bowl", grams: 200 }],
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/meals/new/search");
  await page
    .getByRole("button", { name: "Quick add Greek yogurt", exact: true })
    .click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Greek yogurt.*225 g/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Greek yogurt.*225 g/ }).click();
  await expect(page.getByLabel("Unit")).toHaveValue("g");
  await expect(page.getByLabel("Amount")).toHaveValue("225");
});

test("failed quick adds remain retryable and discarding the meal leaves saved data unchanged", async ({
  page,
  account,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  const db = drizzle(neon(process.env.NEON_PG_CONNECTION_STRING!));
  const [row] = await db
    .insert(foods)
    .values({
      accountId: account.id,
      source: "usda",
      externalId: "123",
      name: "Imported chicken",
      calories: 100,
      protein: 20,
      fat: 2,
      carbs: 0,
    })
    .returning();
  const food = row as Food;
  const original = await saveMeal(page.request, account.today, [
    { food, grams: 150, quantity: 150, servingName: "g" },
  ]);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempts = 0;
  await page.route("**/api/foods/resolve?**", async (route) => {
    if (attempts++ === 0) {
      await pending;
      return route.fulfill({
        status: 503,
        json: { error: "Temporary food lookup failure" },
      });
    }
    return route.fulfill({ json: food });
  });
  try {
    await page.goto(`/meals/${original.id}?date=${account.today}`);
    await page.getByRole("button", { name: "Add food", exact: true }).click();
    const quick = page.getByRole("button", {
      name: "Quick add Imported chicken",
      exact: true,
    });
    const searchUrl = page.url();
    await quick.click();
    await expect(quick).toBeDisabled();
    release();
    await expect(
      page.locator(".food-results-scroll").getByRole("alert"),
    ).toHaveText("Temporary food lookup failure");
    await expect(quick).toBeEnabled();
    await expect(page).toHaveURL(searchUrl);
    await quick.click();
    await expect(page.getByRole("status")).toHaveText(
      "Added Imported chicken to meal.",
    );
    await expect(
      page.locator(".food-results-scroll").getByRole("alert"),
    ).toHaveCount(0);
    await page.getByRole("tab", { name: "My foods", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Quick add/ })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /Imported chicken.*150 g/ }),
    ).toHaveCount(2);
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    const saved = (await (
      await page.request.get(`/api/dashboard?date=${account.today}`)
    ).json()) as Dashboard;
    expect(
      saved.meals.find((meal) => meal.id === original.id)?.entries,
    ).toEqual(original.entries);
  } finally {
    release();
  }
});

test("recent entry pagination deduplicates before paging and excludes archived and other-account foods", async ({
  page,
  account,
  browser,
}) => {
  const db = drizzle(neon(process.env.NEON_PG_CONNECTION_STRING!));
  const rows = await db
    .insert(foods)
    .values(
      Array.from({ length: 23 }, (_, index) => ({
        accountId: account.id,
        source: "custom" as const,
        name: `Recent fixture ${String(index).padStart(2, "0")}`,
        calories: 100,
        protein: 20,
        fat: 2,
        carbs: 0,
      })),
    )
    .returning();
  const refs = rows.map((row) => ({ ...row, servings: [] })) as Food[];
  await saveMeal(
    page.request,
    addDays(account.today, -1),
    refs.map((food) => ({ food, grams: 100, quantity: 100, servingName: "g" })),
  );
  const last = await saveMeal(
    page.request,
    account.today,
    refs.flatMap((food) => [
      { food, grams: 150, quantity: 150, servingName: "g" },
      { food, grams: 200, quantity: 200, servingName: "g" },
    ]),
  );
  const otherId = randomUUID();
  await db
    .insert(accounts)
    .values({ id: otherId, secretHash: "isolated-test-account" });
  try {
    await db.insert(meals).values({
      accountId: otherId,
      date: account.today,
      name: "Other account",
      entries: last.entries.map((entry) => ({
        ...entry,
        grams: 999,
        quantity: 999,
      })),
    });
    const first = (await (
      await page.request.get("/api/foods?recent=true&page=1")
    ).json()) as FoodSearchPage;
    const second = (await (
      await page.request.get("/api/foods?recent=true&page=2")
    ).json()) as FoodSearchPage;
    expect(first.foods).toHaveLength(20);
    expect(first.nextPage).toBe(2);
    expect(second.foods).toHaveLength(3);
    expect(second.nextPage).toBeNull();
    expect(
      new Set([...first.foods, ...second.foods].map((food) => food.id)).size,
    ).toBe(23);
    expect(
      [...first.foods, ...second.foods].every(
        (food) => food.lastEntry?.grams === 200,
      ),
    ).toBe(true);
    expect(
      (await page.request.get("/api/foods?recent=true&page=0")).status(),
    ).toBe(400);
    const signedOut = await browser.newContext();
    try {
      expect(
        (
          await signedOut.request.get(
            "http://127.0.0.1:3100/api/foods?recent=true",
          )
        ).status(),
      ).toBe(401);
    } finally {
      await signedOut.close();
    }
    expect((await page.request.delete(`/api/meals/${last.id}`)).status()).toBe(
      200,
    );
    const fallback = (await (
      await page.request.get("/api/foods?recent=true")
    ).json()) as FoodSearchPage;
    expect(fallback.foods.every((food) => food.lastEntry?.grams === 100)).toBe(
      true,
    );
    expect(
      (await page.request.delete(`/api/foods/${refs[0].id}`)).status(),
    ).toBe(200);
    const archived = (await (
      await page.request.get(
        `/api/foods?recent=true&q=${encodeURIComponent(refs[0].name)}`,
      )
    ).json()) as FoodSearchPage;
    expect(archived.foods.some((food) => food.id === refs[0].id)).toBe(false);
  } finally {
    await db.delete(accounts).where(eq(accounts.id, otherId));
  }
});
