import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { test, expect } from "./fixtures";
import { accounts, recipes } from "../../src/lib/db/schema";
import { entryReferences } from "../../src/lib/recipe-entries";
import type {
  Dashboard,
  Food,
  Meal,
  Recipe,
  RecipeSearchPage,
} from "../../src/lib/types";

const foodInput = {
  name: "Recipe yogurt",
  calories: 60,
  protein: 10,
  fat: 1,
  carbs: 3,
  servings: [],
};

test("recipes reuse meal navigation, keep drafts, and quick add collapsed read-only groups", async ({
  page,
  account,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  const food = (await (
    await page.request.post("/api/foods", { data: foodInput })
  ).json()) as Food;
  await page.goto("/custom-foods");
  await page.getByRole("tab", { name: "Recipes", exact: true }).click();
  await expect(page).toHaveURL(/\/custom-foods\/recipes$/);
  await page
    .getByRole("button", { name: "Create recipe", exact: true })
    .click();
  await page.getByLabel("Recipe name").fill("Breakfast bowl");
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Recipes", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Search foods")).not.toBeFocused();
  await page.getByRole("tab", { name: "My foods", exact: true }).click();
  await page.getByLabel("Search foods").fill("yogurt");
  await page.getByRole("button", { name: /Recipe yogurt.*Custom/ }).click();
  await page.getByLabel("Amount").fill("150");
  await page.goBack();
  await page.goForward();
  await expect(page.getByLabel("Amount")).toHaveValue("150");
  await page
    .getByRole("button", { name: "Add to recipe", exact: true })
    .click();
  await expect(page.getByLabel("Recipe name")).toHaveValue("Breakfast bowl");
  await page.getByRole("button", { name: "Custom food", exact: true }).click();
  await page.getByLabel("Food name").fill("Recipe oats");
  await page
    .locator(".workflow-page")
    .getByLabel("Calories", { exact: false })
    .fill("100");
  await page
    .locator(".workflow-page")
    .getByLabel("Protein", { exact: false })
    .fill("5");
  await page
    .locator(".workflow-page")
    .getByLabel("Fat", { exact: false })
    .fill("2");
  await page
    .locator(".workflow-page")
    .getByLabel("Carbs", { exact: false })
    .fill("15");
  await page.getByRole("button", { name: "Save food", exact: true }).click();
  await page
    .getByRole("button", { name: "Add to recipe", exact: true })
    .click();
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page).toHaveURL(/\/custom-foods\/recipes$/);
  await expect(
    page.getByRole("button", { name: /Breakfast bowl/ }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/recipes-library-mobile.png" });
  const recipe = (
    (await (await page.request.get("/api/recipes")).json()) as RecipeSearchPage
  ).recipes[0];
  expect(recipe.entries).toHaveLength(2);
  expect(recipe.calories).toBe(190);
  expect(recipe.entries[0].foodId).toBe(food.id);
  await page.getByRole("button", { name: /Breakfast bowl/ }).click();
  await page.getByLabel("Recipe name").fill("Discarded name");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page).toHaveURL(/\/custom-foods\/recipes$/);
  expect(
    (await (await page.request.get(`/api/recipes/${recipe.id}`)).json()).name,
  ).toBe("Breakfast bowl");

  await page.goto("/meals/new");
  await page.getByLabel("Meal name").fill("Recipe meal");
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await page.getByRole("tab", { name: "Recipes", exact: true }).click();
  await page.getByLabel("Search recipes").fill("Breakfast");
  const quick = page.getByRole("button", {
    name: "Quick add Breakfast bowl",
    exact: true,
  });
  await expect(quick).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Breakfast bowl", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/recipes-search-mobile.png" });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({
    path: "test-results/recipes-search-small-mobile.png",
  });
  await quick.click();
  await quick.click();
  await expect(page).toHaveURL(/\/meals\/new\/search/);
  await page.goBack();
  const groups = page.locator(".recipe-entry-group");
  await expect(groups).toHaveCount(2);
  await expect(
    groups.first().getByRole("button", { expanded: false }),
  ).toBeVisible();
  await expect(
    groups.first().getByText("Recipe yogurt", { exact: true }),
  ).toBeHidden();
  await groups.first().getByRole("button", { expanded: false }).click();
  await expect(
    groups.first().getByText("Recipe yogurt", { exact: true }),
  ).toBeVisible();
  await expect(groups.first().getByRole("button")).toHaveCount(2);
  await page.screenshot({ path: "test-results/recipes-meal-small-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: "test-results/recipes-meal-desktop.png" });
  await page.goForward();
  await expect(page.getByLabel("Search recipes")).toHaveValue("Breakfast");
  await page.goBack();
  await groups
    .last()
    .getByRole("button", { name: "Remove recipe Breakfast bowl" })
    .click();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  const dashboard = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  const meal = dashboard.meals.find((item) => item.name === "Recipe meal")!;
  expect(meal.calories).toBe(190);
  expect(meal.entries.map((entry) => entry.recipe?.recipeId)).toEqual([
    recipe.id,
    recipe.id,
  ]);
  await page.goto(`/meals/${meal.id}`);
  await expect(
    page
      .locator(".recipe-entry-group")
      .getByRole("button", { expanded: false }),
  ).toBeVisible();
  await page.goto(`/recipes/${recipe.id}`);
  await page.reload();
  await expect(page.getByLabel("Recipe name")).toHaveValue("Breakfast bowl");
  await page.getByRole("button", { name: /Recipe yogurt.*150 g/ }).click();
  await page.getByLabel("Amount").fill("175");
  await page
    .getByRole("button", { name: "Update food entry", exact: true })
    .click();
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page).toHaveURL(/\/custom-foods\/recipes$/);
  const updated = (await (
    await page.request.get(`/api/recipes/${recipe.id}`)
  ).json()) as Recipe;
  expect(updated.entries[0].id).toBe(recipe.entries[0].id);
  expect(updated.calories).toBe(205);
  await page.getByRole("button", { name: /Breakfast bowl/ }).click();
  await page
    .getByRole("button", { name: "Delete recipe", exact: true })
    .click();
  await expect(page).toHaveURL(/\/custom-foods\/recipes$/);
  await expect(page.getByText("No recipes yet.")).toBeVisible();
  const preserved = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(preserved.meals.find((item) => item.id === meal.id)?.entries).toEqual(
    meal.entries,
  );
});

test("recipe snapshots survive edits, archived ingredients, and recipe deletion; server rejects recipe adjustment", async ({
  page,
  account,
}) => {
  const food = (await (
    await page.request.post("/api/foods", { data: foodInput })
  ).json()) as Food;
  const created = await page.request.post("/api/recipes", {
    data: {
      name: "Original bowl",
      entries: [
        { food, grams: 150, quantity: 150, servingName: "g", calories: 999 },
      ],
    },
  });
  expect(created.status()).toBe(201);
  const recipe = (await created.json()) as Recipe;
  expect(recipe.calories).toBe(90);
  const added = await page.request.post("/api/meals", {
    data: {
      name: "Meal with recipe",
      date: account.today,
      entries: [{ recipeId: recipe.id }, { recipeId: recipe.id }],
    },
  });
  expect(added.status()).toBe(201);
  const meal = (await added.json()) as Meal;
  expect(new Set(meal.entries.map((entry) => entry.recipe!.id)).size).toBe(2);
  expect(new Set(meal.entries.map((entry) => entry.id)).size).toBe(2);
  expect(meal.calories).toBe(180);
  expect(
    (
      await page.request.post("/api/meals", {
        data: { ...meal, entries: [{ recipeId: recipe.id, grams: 50 }] },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/meals", {
        data: { ...meal, entries: [{ ...meal.entries[0], grams: 50 }] },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/recipes", {
        data: {
          ...recipe,
          name: "Changed bowl",
          entries: recipe.entries.map((entry) => ({
            ...entry,
            grams: 200,
            quantity: 200,
          })),
        },
      })
    ).status(),
  ).toBe(200);
  const newMeal = (await (
    await page.request.post("/api/meals", {
      data: {
        name: "New recipe version",
        date: account.today,
        entries: [{ recipeId: recipe.id }],
      },
    })
  ).json()) as Meal;
  expect(newMeal.calories).toBe(120);
  expect(newMeal.entries[0].recipe!.name).toBe("Changed bowl");
  expect((await page.request.delete(`/api/foods/${food.id}`)).status()).toBe(
    200,
  );
  expect(
    (
      await page.request.post("/api/meals", {
        data: {
          name: "Archived ingredient",
          date: account.today,
          entries: [{ recipeId: recipe.id }],
        },
      })
    ).status(),
  ).toBe(201);
  expect(
    (await page.request.delete(`/api/recipes/${recipe.id}`)).status(),
  ).toBe(200);
  const saved = await page.request.post("/api/meals", {
    data: {
      ...meal,
      name: "Renamed meal",
      entries: entryReferences(meal.entries),
    },
  });
  expect(saved.status()).toBe(200);
  expect(((await saved.json()) as Meal).entries).toEqual(meal.entries);
  expect((await page.request.get(`/api/recipes/${recipe.id}`)).status()).toBe(
    404,
  );
  expect(
    (
      await page.request.post("/api/meals", {
        data: {
          name: "Deleted recipe",
          date: account.today,
          entries: [{ recipeId: recipe.id }],
        },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      (await (
        await page.request.get("/api/recipes")
      ).json()) as RecipeSearchPage
    ).recipes,
  ).toHaveLength(0);
});

test("recipe search paginates by name and endpoints isolate accounts and require authentication", async ({
  page,
  account,
  browser,
}) => {
  const db = drizzle(neon(process.env.NEON_PG_CONNECTION_STRING!));
  const otherId = randomUUID();
  await db
    .insert(accounts)
    .values({ id: otherId, secretHash: "isolated-test-account" });
  try {
    const [other] = await db
      .insert(recipes)
      .values({ accountId: otherId, name: "Private recipe", entries: [] })
      .returning();
    await db.insert(recipes).values(
      Array.from({ length: 23 }, (_, index) => ({
        accountId: account.id,
        name: `Bowl ${String(index).padStart(2, "0")}`,
        entries: [],
      })),
    );
    const firstResponse = await page.request.get("/api/recipes?page=1");
    expect(firstResponse.headers()["cache-control"]).toContain("no-store");
    const first = (await firstResponse.json()) as RecipeSearchPage;
    const second = (await (
      await page.request.get("/api/recipes?page=2")
    ).json()) as RecipeSearchPage;
    expect(first.recipes).toHaveLength(20);
    expect(first.nextPage).toBe(2);
    expect(second.recipes).toHaveLength(3);
    expect(second.nextPage).toBeNull();
    expect(
      new Set([...first.recipes, ...second.recipes].map((recipe) => recipe.id))
        .size,
    ).toBe(23);
    expect(
      (
        (await (
          await page.request.get("/api/recipes?q=bOwL%2001")
        ).json()) as RecipeSearchPage
      ).recipes.map((recipe) => recipe.name),
    ).toEqual(["Bowl 01"]);
    expect(
      (
        (await (
          await page.request.get("/api/recipes?q=%25")
        ).json()) as RecipeSearchPage
      ).recipes,
    ).toHaveLength(0);
    expect((await page.request.get("/api/recipes?page=0")).status()).toBe(400);
    expect((await page.request.get(`/api/recipes/${other.id}`)).status()).toBe(
      404,
    );
    expect(
      (await page.request.delete(`/api/recipes/${other.id}`)).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post("/api/recipes", {
          data: {
            id: other.id,
            name: "Stolen",
            entries: [
              {
                food: { id: "missing", source: "custom", externalId: null },
                grams: 1,
                quantity: 1,
                servingName: "g",
              },
            ],
          },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post("/api/meals", {
          data: {
            name: "Stolen recipe",
            date: account.today,
            entries: [{ recipeId: other.id }],
          },
        })
      ).status(),
    ).toBe(404);
    const anonymous = await browser.newContext();
    try {
      expect(
        (
          await anonymous.request.get("http://127.0.0.1:3100/api/recipes")
        ).status(),
      ).toBe(401);
      expect(
        (
          await anonymous.request.get(
            `http://127.0.0.1:3100/api/recipes/${other.id}`,
          )
        ).status(),
      ).toBe(401);
      expect(
        (
          await anonymous.request.post("http://127.0.0.1:3100/api/recipes", {
            data: {},
          })
        ).status(),
      ).toBe(401);
      expect(
        (
          await anonymous.request.delete(
            `http://127.0.0.1:3100/api/recipes/${other.id}`,
          )
        ).status(),
      ).toBe(401);
    } finally {
      await anonymous.close();
    }
  } finally {
    await db.delete(accounts).where(eq(accounts.id, otherId));
  }
});
