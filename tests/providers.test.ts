import { afterEach, describe, expect, it, vi } from "vitest";

import { cached } from "../src/lib/providers/cache";
import { parseUsdaFood } from "../src/lib/providers/usda";
import { resolveExternalFood, searchExternalFoods } from "../src/lib/providers";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const usdaNutrition = [
  { nutrientId: 1008, nutrientName: "Energy", unitName: "KCAL", value: 165 },
  { nutrientId: 1003, nutrientName: "Protein", unitName: "G", value: 31 },
  {
    nutrientId: 1004,
    nutrientName: "Total lipid (fat)",
    unitName: "G",
    value: 3.6,
  },
  {
    nutrientId: 1005,
    nutrientName: "Carbohydrate, by difference",
    unitName: "G",
    value: 0,
  },
];

describe("USDA normalization", () => {
  it("uses search nutrient IDs and keeps legitimate zero carbohydrates", () => {
    const food = parseUsdaFood({
      fdcId: 123,
      description: "Chicken",
      foodNutrients: usdaNutrition,
    });
    expect(food).toMatchObject({
      id: "usda:123",
      calories: 165,
      protein: 31,
      fat: 3.6,
      carbs: 0,
    });
  });

  it("handles detail nutrient objects and does not rescale per-100g values by label serving size", () => {
    const food = parseUsdaFood({
      fdcId: 123,
      description: "Chicken",
      servingSize: 150,
      servingSizeUnit: "g",
      householdServingFullText: "1 breast",
      foodNutrients: usdaNutrition.map((row) => ({
        amount: row.value,
        nutrient: { id: row.nutrientId, unitName: row.unitName },
      })),
    });
    expect(food.calories).toBe(165);
    expect(food.servings).toContainEqual({
      id: "usda-label-serving",
      name: "1 breast",
      grams: 150,
    });
  });

  it("converts kilojoules only if kcal energy is absent", () => {
    const food = parseUsdaFood({
      fdcId: 123,
      description: "Chicken",
      foodNutrients: [
        ...usdaNutrition.slice(1),
        { nutrientId: 1062, unitName: "KJ", value: 418.4 },
      ],
    });
    expect(food.calories).toBe(100);
  });

  it("uses Atwater energy for Foundation foods without nutrient 1008", () => {
    const food = parseUsdaFood({
      fdcId: 123,
      description: "Chicken",
      foodNutrients: [
        ...usdaNutrition.slice(1),
        { nutrientId: 2048, unitName: "KCAL", value: 164 },
      ],
    });
    expect(food.calories).toBe(164);
  });

  it("converts label-only nutrients from an explicit gram-based serving", () => {
    const food = parseUsdaFood({
      fdcId: 1,
      description: "Protein bar",
      servingSize: 50,
      servingSizeUnit: "g",
      labelNutrients: {
        calories: { value: 200 },
        protein: { value: 20 },
        fat: { value: 5 },
        carbohydrates: { value: 15 },
      },
    });
    expect(food).toMatchObject({
      calories: 400,
      protein: 40,
      fat: 10,
      carbs: 30,
    });
  });

  it("does not mistake a missing macro for zero", () => {
    expect(() =>
      parseUsdaFood({
        fdcId: 1,
        description: "Unknown",
        foodNutrients: usdaNutrition.slice(0, 3),
      }),
    ).toThrow(/incomplete/);
  });

  it("does not use label nutrients in millilitres as grams", () => {
    expect(() =>
      parseUsdaFood({
        fdcId: 1,
        description: "Oil",
        servingSize: 15,
        servingSizeUnit: "ml",
        labelNutrients: {
          calories: { value: 120 },
          protein: { value: 0 },
          fat: { value: 14 },
          carbohydrates: { value: 0 },
        },
      }),
    ).toThrow(/incomplete/);
  });

  it("includes real food portions and ignores absent gram weights", () => {
    const food = parseUsdaFood({
      fdcId: 123,
      description: "Chicken",
      foodNutrients: usdaNutrition,
      foodPortions: [
        { id: 1, amount: 1, modifier: "breast", gramWeight: 150 },
        { id: 2, amount: 1, modifier: "unknown" },
      ],
    });
    expect(food.servings).toEqual([
      { id: "usda-portion-1", name: "1 breast", grams: 150 },
    ]);
  });
});

describe("provider cache", () => {
  it("coalesces simultaneous identical requests and reuses a warm result", async () => {
    const load = vi.fn(async () => ["result"]);
    const key = "test:coalescing";
    const results = await Promise.all([
      cached(key, 60_000, load),
      cached(key, 60_000, load),
    ]);
    expect(results).toEqual([["result"], ["result"]]);
    expect(await cached(key, 60_000, load)).toEqual(["result"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed requests", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce("ok");
    await expect(cached("test:failure", 60_000, load)).rejects.toThrow(
      "Temporary failure",
    );
    await expect(cached("test:failure", 60_000, load)).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("external provider requests", () => {
  it("searches USDA once and returns normalized foods without additional requests", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-usda-key");
    const fetch = vi.fn(async (_url: string | URL) =>
      Response.json({
        foods: [
          { fdcId: 123, description: "Chicken", foodNutrients: usdaNutrition },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await searchExternalFoods("   request   success fixture   ");
    expect(result.foods).toHaveLength(1);
    expect(result.foods[0]?.source).toBe("usda");
    expect(result.warnings).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const endpoint = new URL(fetch.mock.calls[0]?.[0] as unknown as URL);
    expect(endpoint.hostname).toBe("api.nal.usda.gov");
    expect(endpoint.pathname).toBe("/fdc/v1/foods/search");
    expect(endpoint.searchParams.get("query")).toBe("request success fixture");
  });

  it("returns a sanitized warning when the USDA network request fails", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-private-usda-key");
    const fetch = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Failed https://api.nal.usda.gov?api_key=test-private-usda-key",
        ),
      );
    vi.stubGlobal("fetch", fetch);

    const result = await searchExternalFoods("request failure fixture");
    expect(result.foods).toEqual([]);
    expect(result.warnings).toEqual(["USDA: request failed or timed out."]);
    expect(JSON.stringify(result)).not.toContain("test-private-usda-key");
    expect(JSON.stringify(result)).not.toContain("https://");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns an actionable key warning when USDA denies access", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-usda-key");
    const fetch = vi.fn(async () =>
      Response.json({ private: "upstream response" }, { status: 403 }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await searchExternalFoods("request forbidden fixture");
    expect(result).toEqual({
      foods: [],
      warnings: ["USDA: access denied; check the API key."],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("skips remote requests for short search terms", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await searchExternalFoods(" a ")).toEqual({
      foods: [],
      warnings: [],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resolves only the selected USDA detail record", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-usda-key");
    const fetch = vi.fn(async (_url: string | URL) =>
      Response.json({
        fdcId: 321,
        description: "Chicken",
        foodNutrients: usdaNutrition,
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const food = await resolveExternalFood("usda", "321");
    expect(food.id).toBe("usda:321");
    expect(fetch).toHaveBeenCalledTimes(1);
    const endpoint = new URL(fetch.mock.calls[0]?.[0] as unknown as URL);
    expect(endpoint.hostname).toBe("api.nal.usda.gov");
    expect(endpoint.pathname).toBe("/fdc/v1/food/321");
  });

  it("rejects external identifiers before making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(resolveExternalFood("usda", "../secrets")).rejects.toThrow(
      "Invalid external food identifier",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("USDA rate limits", () => {
  it("honors Retry-After without sending more requests during cooldown", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { fetchJson } = await import("../src/lib/providers/http");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
      )
      .mockResolvedValueOnce(Response.json({ foods: [] }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      fetchJson("USDA", "https://example.test/foods"),
    ).rejects.toThrow("rate limit reached");
    await expect(
      fetchJson("USDA", "https://example.test/foods"),
    ).rejects.toThrow("temporarily unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    await expect(
      fetchJson("USDA", "https://example.test/foods"),
    ).resolves.toEqual({ foods: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("defaults to a one-hour cooldown when Retry-After is absent", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { fetchJson } = await import("../src/lib/providers/http");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ foods: [] }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      fetchJson("USDA", "https://example.test/foods"),
    ).rejects.toThrow("rate limit reached");
    vi.advanceTimersByTime(3_599_000);
    await expect(
      fetchJson("USDA", "https://example.test/foods"),
    ).rejects.toThrow("temporarily unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    await expect(
      fetchJson("USDA", "https://example.test/foods"),
    ).resolves.toEqual({ foods: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
