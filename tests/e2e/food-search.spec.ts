import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { test, expect } from "./fixtures";
import { foods } from "../../src/lib/db/schema";
import type { Food, FoodSearchPage } from "../../src/lib/types";

function food(index: number, source: "custom" | "usda" = "usda"): Food {
  return {
    id:
      source === "usda"
        ? `usda:${index}`
        : `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    source,
    externalId: source === "usda" ? String(index) : null,
    name: `${source === "usda" ? "Apple" : "Custom food"} ${String(index).padStart(2, "0")}`,
    brand: null,
    calories: 60,
    protein: 1,
    fat: 0,
    carbs: 14,
    servings: [],
  };
}

test("USDA results load on scroll, retry a failed page, and keep search and create controls fixed", async ({
  page,
}) => {
  let secondPageAttempts = 0;
  const requested: number[] = [];
  await page.route("**/api/foods?**", (route) =>
    route.fulfill({ json: { foods: [], nextPage: null, warnings: [] } }),
  );
  await page.route("**/api/foods/search?**", async (route) => {
    const pageNumber = Number(
      new URL(route.request().url()).searchParams.get("page"),
    );
    requested.push(pageNumber);
    if (pageNumber === 2 && secondPageAttempts++ === 0) {
      return route.fulfill({
        status: 503,
        json: { error: "Temporary search failure" },
      });
    }
    await route.fulfill({
      json: {
        foods: Array.from({ length: 20 }, (_, index) =>
          food(index + (pageNumber === 1 ? 1 : 20)),
        ),
        nextPage: pageNumber === 1 ? 2 : null,
        warnings: [],
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Log meal", exact: true }).click();
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  const input = page.getByLabel("Search foods");
  const create = page.getByRole("button", {
    name: "Create custom food",
    exact: true,
  });
  const dialog = page.getByRole("dialog");
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
  await input.fill("apple");
  await expect(
    page.getByRole("button", { name: /^Apple \d+ USDA$/ }),
  ).toHaveCount(20);
  expect(requested).toEqual([1]);
  const beforeInput = await input.boundingBox();
  const beforeCreate = await create.boundingBox();
  const bounds = await dialog.boundingBox();
  expect(bounds!.height).toBeGreaterThan(page.viewportSize()!.height * 0.9);
  const list = page.getByLabel("Food results", { exact: true });
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    page.getByRole("button", { name: "Retry loading USDA foods", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Apple \d+ USDA$/ }),
  ).toHaveCount(20);
  await page
    .getByRole("button", { name: "Retry loading USDA foods", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Apple \d+ USDA$/ }),
  ).toHaveCount(39);
  expect(requested).toEqual([1, 2, 2]);
  await expect(
    page.getByRole("button", { name: "Apple 20 USDA", exact: true }),
  ).toHaveCount(1);
  await expect(input).toBeInViewport();
  await expect(create).toBeInViewport();
  expect((await input.boundingBox())!.y).toBeCloseTo(beforeInput!.y, 0);
  expect((await create.boundingBox())!.y).toBeCloseTo(beforeCreate!.y, 0);
  await page.screenshot({ path: "test-results/food-search-paged-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await expect(input).toBeInViewport();
  await expect(create).toBeInViewport();
  await page.screenshot({ path: "test-results/food-search-paged-desktop.png" });
  await page.setViewportSize({ width: 390, height: 440 });
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await input.fill("pear");
  await expect
    .poll(() => list.evaluate((element) => element.scrollTop))
    .toBe(0);
});

test("custom foods paginate in the list while the creation action remains available", async ({
  page,
}) => {
  const requested: number[] = [];
  await page.route("**/api/foods?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("custom") !== "true") return route.fallback();
    const pageNumber = Number(params.get("page"));
    requested.push(pageNumber);
    await route.fulfill({
      json: {
        foods: Array.from({ length: pageNumber === 1 ? 20 : 3 }, (_, index) =>
          food(index + (pageNumber === 1 ? 1 : 21), "custom"),
        ),
        nextPage: pageNumber === 1 ? 2 : null,
        warnings: [],
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Custom foods", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Custom food \d+ Custom$/ }),
  ).toHaveCount(20);
  expect(requested).toEqual([1]);
  const list = page.getByLabel("Custom food results", { exact: true });
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    page.getByRole("button", { name: /^Custom food \d+ Custom$/ }),
  ).toHaveCount(23);
  expect(requested).toEqual([1, 2]);
  await expect(page.getByLabel("Search custom foods")).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Create custom food", exact: true }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 440 });
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByLabel("Search custom foods").fill("new query");
  await expect
    .poll(() => list.evaluate((element) => element.scrollTop))
    .toBe(0);
});

test("USDA search and selected details reuse client caches across repeated selections", async ({
  page,
}) => {
  let searchRequests = 0;
  let detailRequests = 0;
  await page.route("**/api/foods?**", (route) =>
    route.fulfill({ json: { foods: [], nextPage: null, warnings: [] } }),
  );
  await page.route("**/api/foods/search?**", (route) => {
    searchRequests++;
    return route.fulfill({
      json: { foods: [food(1)], nextPage: null, warnings: [] },
    });
  });
  await page.route("**/api/foods/resolve?**", (route) => {
    detailRequests++;
    return route.fulfill({ json: food(1) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Log meal", exact: true }).click();
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await page.getByLabel("Search foods").fill("  APPLE  ");
  await page
    .getByRole("button", { name: "Apple 01 USDA", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Food details", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByLabel("Search foods").fill("apple");
  await page
    .getByRole("button", { name: "Apple 01 USDA", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Food details", exact: true }),
  ).toBeVisible();
  expect(searchRequests).toBe(1);
  expect(detailRequests).toBe(1);
});

test("local food API returns all pages with a validated page number", async ({
  page,
  account,
}) => {
  const db = drizzle(neon(process.env.NEON_PG_CONNECTION_STRING!));
  await db.insert(foods).values(
    Array.from({ length: 23 }, (_, index) => ({
      accountId: account.id,
      source: "custom" as const,
      name: `Pagination fixture ${String(index).padStart(2, "0")}`,
      calories: 100,
      protein: 10,
      fat: 2,
      carbs: 10,
    })),
  );
  const first = (await (
    await page.request.get("/api/foods?custom=true&page=1")
  ).json()) as FoodSearchPage;
  const second = (await (
    await page.request.get("/api/foods?custom=true&page=2")
  ).json()) as FoodSearchPage;
  expect(first.foods).toHaveLength(20);
  expect(first.nextPage).toBe(2);
  expect(second.foods).toHaveLength(3);
  expect(second.nextPage).toBeNull();
  expect(
    new Set([...first.foods, ...second.foods].map((item) => item.id)).size,
  ).toBe(23);
  expect((await page.request.get("/api/foods?page=0")).status()).toBe(400);
  expect(
    (await page.request.get("/api/foods/search?q=apple&page=1.5")).status(),
  ).toBe(400);
});
