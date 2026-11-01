import { test, expect } from "./fixtures";
import { addDays } from "../../src/lib/dates";
import { calculateTargets } from "../../src/lib/nutrition";
import type { Dashboard, Food, Meal } from "../../src/lib/types";

const foodInput = {
  name: "Test yogurt",
  calories: 60,
  protein: 10,
  fat: 1,
  carbs: 3,
  servings: [{ id: "bowl", name: "bowl", grams: 150 }],
};

test("meal creation, quantity editing, explicit save/discard, library edits, and deletion", async ({
  page,
  account,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Calories", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Next day" })).toBeDisabled();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Custom food", exact: true }).click();
  await page.getByLabel("Food name").fill(foodInput.name);
  await page
    .locator(".workflow-page")
    .getByLabel("Calories", { exact: false })
    .fill("60");
  await page
    .locator(".workflow-page")
    .getByLabel("Protein", { exact: false })
    .fill("10");
  await page
    .locator(".workflow-page")
    .getByLabel("Fat", { exact: false })
    .fill("1");
  await page
    .locator(".workflow-page")
    .getByLabel("Carbs", { exact: false })
    .fill("3");
  await page.getByRole("button", { name: "Add serving size" }).click();
  await page.getByLabel("Serving 1", { exact: true }).fill("bowl");
  await page.getByLabel("Grams", { exact: true }).fill("150");
  await page.getByRole("button", { name: "Save food", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Food details", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Unit").selectOption({ label: "bowl (150 g)" });
  await page.getByLabel("Amount").fill("2");
  await page.getByRole("button", { name: "Add to meal" }).click();
  await page.getByLabel("Meal name").fill("Lunch");
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.locator(".workflow-page")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Calories", exact: true }),
  ).toBeVisible();
  const first = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(first.meals).toHaveLength(1);
  expect(first.meals[0].calories).toBe(180);
  expect(first.meals[0].entries[0].grams).toBe(300);

  await page.getByRole("button", { name: /Lunch/ }).click();
  await page.getByRole("button", { name: /Test yogurt.*2 bowl/ }).click();
  await page.getByLabel("Amount").fill("1");
  await page.getByRole("button", { name: "Update food entry" }).click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.locator(".workflow-page")).toHaveCount(0);
  const discarded = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(discarded.meals[0].calories).toBe(180);

  await page.getByRole("button", { name: "Custom foods", exact: true }).click();
  await page.getByRole("button", { name: /Test yogurt/ }).click();
  await page
    .locator(".workflow-page")
    .getByLabel("Calories", { exact: false })
    .fill("100");
  await page.getByRole("button", { name: "Save food", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/custom-foods");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await page.getByRole("button", { name: /Lunch/ }).click();
  await page.getByRole("button", { name: /Test yogurt.*2 bowl/ }).click();
  await page.getByLabel("Amount").fill("1");
  await page.getByRole("button", { name: "Update food entry" }).click();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.locator(".workflow-page")).toHaveCount(0);
  const updated = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(updated.meals[0].calories).toBe(90); // Original 60 kcal/100g snapshot.

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByLabel("Meal name")).toHaveValue("Meal 2");
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await expect(page.getByLabel("Search foods")).not.toBeFocused();
  await page.getByRole("tab", { name: "My foods", exact: true }).click();
  await page.getByLabel("Search foods").fill("Test yogurt");
  await page.getByRole("button", { name: /Test yogurt.*Custom/ }).click();
  await page.getByRole("button", { name: "Add to meal" }).click();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.locator(".workflow-page")).toHaveCount(0);
  const futureEntry = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(futureEntry.meals[1].calories).toBe(100);

  await page.getByRole("button", { name: /Lunch/ }).click();
  await page.getByRole("button", { name: "Delete meal", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.locator(".workflow-page")).toHaveCount(0);
  const deleted = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(deleted.meals).toHaveLength(1);
  expect(deleted.meals[0].name).toBe("Meal 2");
});

test("historical measurements, prior-seven-day summary, low-day completion and range limits", async ({
  page,
  account,
}) => {
  const foodResponse = await page.request.post("/api/foods", {
    data: foodInput,
  });
  expect(foodResponse.status()).toBe(201);
  const food = (await foodResponse.json()) as Food;
  const yesterday = addDays(account.today, -1);
  const mealResponse = await page.request.post("/api/meals", {
    data: {
      date: yesterday,
      name: "Small meal",
      entries: [{ food, grams: 100, quantity: 100, servingName: "g" }],
    },
  });
  expect(mealResponse.status()).toBe(201);
  const before = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(before.summary.includedDays).toBe(0);
  expect(
    (
      await page.request.put(`/api/days/${yesterday}`, {
        data: { completed: true },
      })
    ).status(),
  ).toBe(200);
  const newInput = {
    ...account.input,
    effectiveDate: account.today,
    weightKg: 85,
  };
  expect(
    (await page.request.post("/api/measurements", { data: newInput })).status(),
  ).toBe(201);
  const after = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(after.measurement.weightKg).toBe(85);
  expect(after.summary.includedDays).toBe(1);
  expect(after.summary.averageDeficit).toBe(
    calculateTargets(account.input).maintenance - 60,
  );
  expect(after.summary.projectedDate).not.toBeNull();
  const historic = (await (
    await page.request.get(`/api/dashboard?date=${yesterday}`)
  ).json()) as Dashboard;
  expect(historic.measurement.weightKg).toBe(90);
  expect(historic.summary.includedDays).toBe(0); // Viewed date is never included.
  expect(
    (
      await page.request.get(`/api/dashboard?date=${addDays(account.today, 1)}`)
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.get(
        `/api/dashboard?date=${addDays(account.startDate, -1)}`,
      )
    ).status(),
  ).toBe(400);
  await page.goto("/");
  await page.getByLabel("Select date").fill(yesterday);
  await expect(page.getByRole("button", { name: /Small meal/ })).toBeVisible();
  await expect(page.getByLabel("Select date")).toHaveValue(yesterday);
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByLabel("Select date")).toHaveValue(account.today);
});

test("local fuzzy food search, account ownership, snapshot persistence, and source validation", async ({
  page,
  account,
  browser,
}) => {
  const food = (await (
    await page.request.post("/api/foods", {
      data: { ...foodInput, name: "Chicken breast" },
    })
  ).json()) as Food;
  const detail = await page.request.get(`/api/foods/${food.id}`);
  expect(detail.status()).toBe(200);
  expect(detail.headers()["cache-control"]).toContain("no-store");
  expect(((await detail.json()) as Food).name).toBe("Chicken breast");
  const signedOut = await browser.newContext();
  try {
    expect(
      (
        await signedOut.request.get(
          `http://127.0.0.1:3100/api/foods/${food.id}`,
        )
      ).status(),
    ).toBe(401);
  } finally {
    await signedOut.close();
  }
  expect((await page.request.get("/api/foods/not-a-uuid")).status()).toBe(400);
  const results = (await (
    await page.request.get("/api/foods?q=chiken")
  ).json()) as { foods: Food[] };
  expect(results.foods.some((item) => item.id === food.id)).toBe(true);
  const saved = await page.request.post("/api/meals", {
    data: {
      date: account.today,
      name: "Meal 1",
      entries: [{ food, grams: 100, quantity: 100, servingName: "g" }],
    },
  });
  expect(saved.status()).toBe(201);
  const meal = (await saved.json()) as Meal;
  expect(
    (
      await page.request.patch(`/api/foods/${food.id}`, {
        data: { ...foodInput, name: "Chicken breast", calories: 200 },
      })
    ).status(),
  ).toBe(200);
  const edit = await page.request.post("/api/meals", {
    data: {
      id: meal.id,
      date: account.today,
      name: "Edited",
      entries: [
        {
          id: meal.entries[0].id,
          food,
          grams: 200,
          quantity: 200,
          servingName: "g",
        },
      ],
    },
  });
  expect(((await edit.json()) as Meal).calories).toBe(120);
  const fresh = await page.request.post("/api/meals", {
    data: {
      date: account.today,
      name: "New entry",
      entries: [{ food, grams: 100, quantity: 100, servingName: "g" }],
    },
  });
  expect(((await fresh.json()) as Meal).calories).toBe(200);
  expect(
    (
      await page.request.delete(
        `/api/meals/00000000-0000-4000-8000-000000000099`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post("/api/foods", {
        data: { ...foodInput, calories: -1 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/meals", {
        data: { date: account.today, name: "Invalid", entries: [] },
      })
    ).status(),
  ).toBe(400);
  expect((await page.request.delete(`/api/foods/${food.id}`)).status()).toBe(
    200,
  );
  expect((await page.request.get(`/api/foods/${food.id}`)).status()).toBe(404);
  const remaining = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(remaining.meals).toHaveLength(2);
  expect(remaining.meals[0].entries[0].food.name).toBe("Chicken breast");
});

test("a backdated reached goal uses the historical target rather than today's target", async ({
  page,
  account,
}) => {
  const historicalDate = addDays(account.today, -3);
  expect(
    (
      await page.request.post("/api/measurements", {
        data: {
          ...account.input,
          effectiveDate: account.today,
          targetWeightKg: 75,
        },
      })
    ).status(),
  ).toBe(201);
  const reached = await page.request.post("/api/measurements", {
    data: {
      ...account.input,
      effectiveDate: historicalDate,
      weightKg: 79,
      targetWeightKg: 80,
    },
  });
  expect(reached.status()).toBe(201);
  const historical = (await (
    await page.request.get(`/api/dashboard?date=${historicalDate}`)
  ).json()) as Dashboard;
  expect(historical.summary.targetReached).toBe(true);
  expect(historical.measurement.targetWeightKg).toBe(80);
  const today = (await (
    await page.request.get(`/api/dashboard?date=${account.today}`)
  ).json()) as Dashboard;
  expect(today.measurement.targetWeightKg).toBe(75);
});

test("mobile layout, install manifest and service worker do not cache personal data", async ({
  page,
  account,
}) => {
  const food = (await (
    await page.request.post("/api/foods", {
      data: {
        name: "Chicken & rice",
        calories: 200,
        protein: 22,
        fat: 6,
        carbs: 15,
        servings: [],
      },
    })
  ).json()) as Food;
  const intakes = [2350, 2580, 1920, 3100, 2450, 2670, 2290, 2460];
  for (const [index, calories] of intakes.entries()) {
    const date = addDays(account.today, index - 7);
    const response = await page.request.post("/api/meals", {
      data: {
        date,
        name: index === 7 ? "Lunch" : "Daily meals",
        entries: [
          {
            food,
            grams: calories / 2,
            quantity: calories / 2,
            servingName: "g",
          },
        ],
      },
    });
    expect(response.status()).toBe(201);
  }
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Calories", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  );
  expect((await page.request.get("/icons/icon-192.png")).status()).toBe(200);
  await page.evaluate(async () => navigator.serviceWorker.ready);
  expect(await page.evaluate(async () => (await caches.keys()).length)).toBe(0);
  await page.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/desktop-dashboard.png",
    fullPage: true,
  });
  expect(
    (await page.request.get(`/api/dashboard?date=${account.today}`)).headers()[
      "cache-control"
    ],
  ).toContain("no-store");
});

test.describe("initial setup", () => {
  test.use({ initialProfile: false });
  test("onboarding calculates targets and keeps the profile across reloads", async ({
    page,
    account,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Initial measurements" }),
    ).toBeVisible();
    await page.getByLabel("Current weight").fill("90");
    await page.getByLabel("Target weight").fill("80");
    await page.getByLabel("Height").fill("180");
    await page.getByLabel("Age").fill("30");
    const [saved] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/measurements") &&
          response.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Set targets" }).click(),
    ]);
    expect(saved.status(), await saved.text()).toBe(201);
    await expect(
      page.getByRole("heading", { name: "Calories", exact: true }),
    ).toBeVisible();
    const data = await (await page.request.get("/api/bootstrap")).json();
    expect(data.startDate).toBe(account.today);
    expect(data.measurement.maintenance).toBe(
      calculateTargets({ ...account.input, effectiveDate: account.today })
        .maintenance,
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Calories", exact: true }),
    ).toBeVisible();
  });
});
