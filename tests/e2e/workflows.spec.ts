import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures";
import type { Dashboard, Food, Meal } from "../../src/lib/types";

const customFoodInput = {
  name: "Navigation yogurt",
  calories: 60,
  protein: 10,
  fat: 1,
  carbs: 3,
  servings: [],
};

async function expectPath(page: Page, pathname: string) {
  await expect(page).toHaveURL((url) => url.pathname === pathname);
}

async function fillFood(page: Page, name: string) {
  const form = page.locator(".workflow-page");
  await form.getByLabel("Food name").fill(name);
  await form.getByLabel("Calories", { exact: false }).fill("60");
  await form.getByLabel("Protein", { exact: false }).fill("10");
  await form.getByLabel("Fat", { exact: false }).fill("1");
  await form.getByLabel("Carbs", { exact: false }).fill("3");
}

test("browser Back and Forward preserve a meal draft through search, details, and entry changes", async ({
  page,
  account,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.route("**/api/foods/search?**", (route) =>
    route.fulfill({ json: { foods: [], warnings: [], nextPage: null } }),
  );
  const response = await page.request.post("/api/foods", {
    data: customFoodInput,
  });
  expect(response.status()).toBe(201);
  const food = (await response.json()) as Food;
  const base = "/meals/new";
  await page.goto("/");
  await page.getByRole("button", { name: "Log meal", exact: true }).click();
  await expectPath(page, base);
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("date") === account.today,
  );
  await page.getByLabel("Meal name").fill("Draft lunch");
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await expectPath(page, `${base}/search`);
  await expect(page.locator(".workflow-header h1")).toHaveText("Search foods");
  await expect(page.getByLabel("Search foods")).not.toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Search foods").fill(customFoodInput.name);
  await page.getByRole("button", { name: /Navigation yogurt.*Custom/ }).click();
  await expectPath(page, `${base}/food/${food.id}`);
  await expect(page.getByLabel("Amount")).toHaveValue("100");
  await page.getByLabel("Amount").fill("150");

  await page.goBack();
  await expectPath(page, `${base}/search`);
  await expect(page.getByLabel("Search foods")).toHaveValue(
    customFoodInput.name,
  );
  await page.goForward();
  await expectPath(page, `${base}/food/${food.id}`);
  await expect(page.getByLabel("Amount")).toHaveValue("150");
  await page.getByRole("button", { name: "Add to meal", exact: true }).click();
  await expectPath(page, base);
  await expect(page.getByLabel("Meal name")).toHaveValue("Draft lunch");
  await expect(
    page.getByRole("button", { name: /Navigation yogurt.*150 g/ }),
  ).toBeVisible();

  await page.goForward();
  await expectPath(page, `${base}/search`);
  await page.goBack();
  await expectPath(page, base);
  await expect(page.getByLabel("Meal name")).toHaveValue("Draft lunch");
  await expect(
    page.getByRole("button", { name: /Navigation yogurt.*150 g/ }),
  ).toBeVisible();
  const unsaved = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(unsaved.meals).toEqual([]);
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expectPath(page, "/");
  const saved = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(saved.meals).toHaveLength(1);
  expect(saved.meals[0]?.name).toBe("Draft lunch");
  expect(saved.meals[0]?.entries[0]?.grams).toBe(150);
});

test("custom-food creation returns to its search origin without losing the meal draft", async ({
  page,
  account,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.route("**/api/foods/search?**", (route) =>
    route.fulfill({ json: { foods: [], warnings: [], nextPage: null } }),
  );
  await page.goto(`/meals/new?date=${account.today}`);
  await page.getByLabel("Meal name").fill("Preserved draft");
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await page.getByLabel("Search foods").fill("unsaved food");
  await page
    .getByRole("button", { name: "Create custom food", exact: true })
    .click();
  await expectPath(page, "/meals/new/custom-food");
  await page.getByLabel("Food name").fill("Discard this food");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expectPath(page, "/meals/new/search");
  await expect(page.getByLabel("Search foods")).toHaveValue("unsaved food");

  await page
    .getByRole("button", { name: "Create custom food", exact: true })
    .click();
  await expectPath(page, "/meals/new/custom-food");
  await expect(page.getByLabel("Food name")).toHaveValue("");
  await page.getByLabel("Food name").fill("Retained food draft");
  await page.goBack();
  await expectPath(page, "/meals/new/search");
  await page.goForward();
  await expectPath(page, "/meals/new/custom-food");
  await expect(page.getByLabel("Food name")).toHaveValue("Retained food draft");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expectPath(page, "/meals/new/search");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectPath(page, "/meals/new");
  await expect(page.getByLabel("Meal name")).toHaveValue("Preserved draft");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expectPath(page, "/");
  const foods = (await (
    await page.request.get("/api/foods?custom=true")
  ).json()) as { foods: Food[] };
  expect(foods.foods).toEqual([]);
});

test("custom-food library has direct create and edit routes that survive refresh", async ({
  page,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/custom-foods");
  await expect(page.locator(".workflow-header h1")).toHaveText("Custom foods");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create custom food", exact: true })
    .click();
  await expectPath(page, "/custom-foods/new");
  await fillFood(page, "Library navigation yogurt");
  await page.goBack();
  await expectPath(page, "/custom-foods");
  await page.goForward();
  await expectPath(page, "/custom-foods/new");
  await expect(page.getByLabel("Food name")).toHaveValue(
    "Library navigation yogurt",
  );
  const [response] = await Promise.all([
    page.waitForResponse(
      (result) =>
        new URL(result.url()).pathname === "/api/foods" &&
        result.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Save food", exact: true }).click(),
  ]);
  expect(response.status()).toBe(201);
  const food = (await response.json()) as Food;
  await expectPath(page, "/custom-foods");
  await page
    .getByRole("button", { name: /Library navigation yogurt.*Custom/ })
    .click();
  await expectPath(page, `/custom-foods/${food.id}`);
  await page.reload();
  await expect(page.getByLabel("Food name")).toHaveValue(food.name);
  await page
    .locator(".workflow-page")
    .getByLabel("Calories", { exact: false })
    .fill("120");
  await page.getByRole("button", { name: "Save food", exact: true }).click();
  await expectPath(page, "/custom-foods");
  await page
    .getByRole("button", { name: /Library navigation yogurt.*Custom/ })
    .click();
  await expectPath(page, `/custom-foods/${food.id}`);
  await expect(
    page.locator(".workflow-page").getByLabel("Calories", { exact: false }),
  ).toHaveValue("120");
  await page.getByRole("button", { name: "Delete food", exact: true }).click();
  await expectPath(page, "/custom-foods");
  await expect(
    page.getByRole("button", { name: /Library navigation yogurt.*Custom/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectPath(page, "/");
});

test("direct saved-meal and entry routes reload canonical snapshots and preserve entry identity", async ({
  page,
  account,
}) => {
  const foodResponse = await page.request.post("/api/foods", {
    data: customFoodInput,
  });
  expect(foodResponse.status()).toBe(201);
  const food = (await foodResponse.json()) as Food;
  const mealResponse = await page.request.post("/api/meals", {
    data: {
      date: account.today,
      name: "Direct edit",
      entries: [{ food, grams: 100, quantity: 100, servingName: "g" }],
    },
  });
  expect(mealResponse.status()).toBe(201);
  const meal = (await mealResponse.json()) as Meal;
  await page.goto(`/meals/${meal.id}?date=${account.today}`);
  await expect(page.getByLabel("Meal name")).toHaveValue("Direct edit");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Meal name")).toHaveValue("Direct edit");
  await page.getByLabel("Meal name").fill("Direct edit draft");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectPath(page, "/");
  await page.getByRole("button", { name: /Direct edit/ }).click();
  await expect(page.getByLabel("Meal name")).toHaveValue("Direct edit draft");
  await page.getByRole("button", { name: /Navigation yogurt.*100 g/ }).click();
  await expectPath(page, `/meals/${meal.id}/entry/${meal.entries[0]!.id}`);
  await page.reload();
  await expect(page.getByLabel("Amount")).toHaveValue("100");
  await page.getByLabel("Amount").fill("200");
  await page.getByRole("button", { name: "Update food entry" }).click();
  await expectPath(page, `/meals/${meal.id}`);
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expectPath(page, "/");
  const dashboard = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(dashboard.meals).toHaveLength(1);
  expect(dashboard.meals[0]?.entries[0]?.id).toBe(meal.entries[0]!.id);
  expect(dashboard.meals[0]?.entries[0]?.grams).toBe(200);
  expect(dashboard.meals[0]?.calories).toBe(120);
});

test("a resized visual viewport keeps lower food-form actions reachable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let height = window.innerHeight;
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => height },
      width: { get: () => window.innerWidth },
      offsetTop: { get: () => 0 },
      offsetLeft: { get: () => 0 },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    Object.defineProperty(window, "setTestViewportHeight", {
      value: (nextHeight: number) => {
        height = nextHeight;
        viewport.dispatchEvent(new Event("resize"));
      },
    });
  });
  await page.goto("/custom-foods/new");
  await fillFood(page, "Keyboard yogurt");
  for (let index = 0; index < 3; index++) {
    await page.getByRole("button", { name: "Add serving size" }).click();
    await page
      .getByLabel(`Serving ${index + 1}`, { exact: true })
      .fill(`portion ${index + 1}`);
    await page.getByLabel("Grams", { exact: true }).nth(index).fill("100");
  }
  await page.getByLabel("Food name").focus();
  await page.setViewportSize({ width: 390, height: 440 });
  await page.evaluate(() => {
    (
      window as unknown as { setTestViewportHeight: (height: number) => void }
    ).setTestViewportHeight(330);
  });
  await expect(page.locator(".workflow-page")).toHaveAttribute(
    "data-keyboard-open",
    "true",
  );
  const save = page.getByRole("button", { name: "Save food", exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: "test-results/custom-food-keyboard.png" });
  await save.click();
  await expectPath(page, "/custom-foods");
  await expect(
    page.getByRole("button", { name: /Keyboard yogurt.*Custom/ }),
  ).toBeVisible();
});
