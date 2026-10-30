import { test, expect } from "./fixtures";
import type { Food } from "../../src/lib/types";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const food: Food = {
  id: "00000000-0000-4000-8000-000000000099",
  name: "Test yogurt",
  source: "custom",
  externalId: null,
  brand: null,
  calories: 60,
  protein: 10,
  fat: 1,
  carbs: 3,
  servings: [],
};

test("custom foods shows loading without false empty states or shifting the search field", async ({
  page,
}) => {
  const initial = deferred();
  const filter = deferred();
  await page.route("**/api/foods?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("custom") !== "true") return route.fallback();
    const query = url.searchParams.get("q");
    await (query ? filter.promise : initial.promise);
    await route.fulfill({ json: { foods: query ? [] : [food] } });
  });

  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Custom foods", exact: true })
      .click();
    await expect(page).toHaveURL((url) => url.pathname === "/custom-foods");
    const input = page.getByLabel("Search custom foods");
    await expect(
      page.getByRole("status", { name: "Loading custom foods", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("No custom foods", { exact: true }),
    ).toHaveCount(0);
    await page.locator(".workflow-page").evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    const loadingBounds = await input.boundingBox();
    await page.screenshot({ path: "test-results/custom-foods-loading.png" });

    initial.resolve();
    await expect(
      page.getByRole("button", { name: /Test yogurt.*Custom/ }),
    ).toBeVisible();
    const loadedBounds = await input.boundingBox();
    expect(Math.abs(loadedBounds!.y - loadingBounds!.y)).toBeLessThan(1);

    await input.fill("no matching foods");
    await expect(
      page.getByRole("status", { name: "Searching custom foods", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Test yogurt.*Custom/ }),
    ).toHaveCount(0);
    await expect(page.getByText("No matches", { exact: true })).toHaveCount(0);
    filter.resolve();
    await expect(page.getByText("No matches", { exact: true })).toBeVisible();
    const emptyBounds = await input.boundingBox();
    expect(Math.abs(emptyBounds!.y - loadingBounds!.y)).toBeLessThan(1);
  } finally {
    initial.resolve();
    filter.resolve();
  }
});

test("saved and USDA food searches show independent loading states through debounce and requests", async ({
  page,
}) => {
  const recent = deferred();
  const local = deferred();
  const remote = deferred();
  await page.route("**/api/foods?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    await (query ? local.promise : recent.promise);
    await route.fulfill({
      json: { foods: [{ ...food, name: query ? "Apple" : food.name }] },
    });
  });
  await page.route("**/api/foods/search?**", async (route) => {
    await remote.promise;
    await route.fulfill({ json: { foods: [], warnings: [] } });
  });

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Log meal", exact: true }).click();
    await page.getByRole("button", { name: "Add food", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/meals/new/search");
    await expect(page.locator(".workflow-header h1")).toHaveText(
      "Search foods",
    );
    const input = page.getByLabel("Search foods");
    await expect(input).not.toBeFocused();
    await expect(
      page.getByRole("status", { name: "Loading recent foods", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Foods from saved meals appear here.", { exact: true }),
    ).toHaveCount(0);
    recent.resolve();
    await expect(
      page.getByRole("button", { name: /Test yogurt.*Custom/ }),
    ).toBeVisible();
    const recentBounds = await input.boundingBox();

    await input.fill("apple");
    await expect(
      page.getByRole("status", { name: "Searching saved foods", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Searching USDA foods", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Test yogurt.*Custom/ }),
    ).toHaveCount(0);
    await expect(
      page.getByText("No saved matches.", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("No additional matches.", { exact: true }),
    ).toHaveCount(0);

    local.resolve();
    await expect(
      page.getByRole("button", { name: /Apple.*Custom/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Searching USDA foods", exact: true }),
    ).toBeVisible();
    const pendingBounds = await input.boundingBox();
    expect(Math.abs(pendingBounds!.y - recentBounds!.y)).toBeLessThan(1);
    await page.screenshot({ path: "test-results/food-search-loading.png" });
    remote.resolve();
    await expect(
      page.getByText("No additional matches.", { exact: true }),
    ).toBeVisible();
    const readyBounds = await input.boundingBox();
    expect(Math.abs(readyBounds!.y - recentBounds!.y)).toBeLessThan(1);
  } finally {
    recent.resolve();
    local.resolve();
    remote.resolve();
  }
});

test("day requests show card placeholders until the real data arrives", async ({
  page,
}) => {
  const day = deferred();
  await page.route("**/api/dashboard?**", async (route) => {
    await day.promise;
    await route.continue();
  });
  try {
    await page.goto("/");
    await expect(
      page.getByRole("status", { name: "Loading day", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Calories", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Log meal", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: "test-results/day-loading.png",
      fullPage: true,
    });
    day.resolve();
    await expect(
      page.getByRole("heading", { name: "Calories", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Loading day", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Log meal", exact: true }),
    ).toBeEnabled();
  } finally {
    day.resolve();
  }
});
