import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBefore,
  isDateString,
  todayInTashkent,
} from "../src/lib/dates";
import {
  calculateTargets,
  calorieTone,
  scaleNutrients,
  summarize,
  sumNutrients,
} from "../src/lib/nutrition";
import type { DayStat, Measurement, MeasurementInput } from "../src/lib/types";

const input: MeasurementInput = {
  effectiveDate: "2026-10-01",
  sex: "male",
  age: 30,
  heightCm: 180,
  weightKg: 80,
  targetWeightKg: 75,
  activityLevel: "moderate",
};

function measurement(overrides: Partial<Measurement> = {}): Measurement {
  return {
    ...input,
    ...calculateTargets(input),
    id: "measurement",
    createdAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function day(date: string, overrides: Partial<DayStat> = {}): DayStat {
  return {
    date,
    calories: 2_000,
    protein: 150,
    fat: 70,
    carbs: 180,
    maintenance: 2_500,
    mild: 2_350,
    steady: 2_200,
    extreme: 1_800,
    completed: false,
    eligible: true,
    ...overrides,
  };
}

describe("calendar dates", () => {
  it("uses the fixed Tashkent date at the UTC day boundary", () => {
    expect(todayInTashkent(new Date("2026-10-29T18:59:59Z"))).toBe(
      "2026-10-29",
    );
    expect(todayInTashkent(new Date("2026-10-29T19:00:00Z"))).toBe(
      "2026-10-30",
    );
  });

  it("validates real dates, including leap days", () => {
    expect(isDateString("2024-02-29")).toBe(true);
    expect(isDateString("2026-02-29")).toBe(false);
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-13-01")).toBe(false);
    expect(isDateString("2026-2-01")).toBe(false);
    expect(isDateString("2026-10-01T00:00:00Z")).toBe(false);
  });

  it("adds calendar days across month/year boundaries and excludes the reference date", () => {
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBefore("2026-01-03", 3)).toEqual([
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
    expect(daysBefore("2026-01-03", 0)).toEqual([]);
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
    expect(() => addDays("2026-02-01", 1.5)).toThrow(RangeError);
    expect(() => daysBefore("2026-01-03", -1)).toThrow(RangeError);
  });
});

describe("calorie and macro targets", () => {
  it("calculates Mifflin–St Jeor maintenance and applies the chosen activity factor", () => {
    const targets = calculateTargets(input);
    expect(targets.activityFactor).toBe(1.55);
    expect(targets.maintenance).toBe(2_759); // (800 + 1125 - 150 + 5) × 1.55
    expect(targets).toMatchObject({
      mild: 2_552,
      steady: 2_345,
      extreme: 1_931,
    });
    expect(calculateTargets({ ...input, sex: "female" }).maintenance).toBe(
      2_502,
    );
    expect(
      calculateTargets({ ...input, activityLevel: "light" }).maintenance,
    ).toBe(2_448);
  });

  it("uses the requested 40/35/25 protein/fat/carbohydrate split", () => {
    const targets = calculateTargets(input);
    expect(targets.proteinTarget).toBeCloseTo((targets.steady * 0.4) / 4, 0);
    expect(targets.fatTarget).toBeCloseTo((targets.steady * 0.35) / 9, 0);
    expect(targets.carbsTarget).toBeCloseTo((targets.steady * 0.25) / 4, 0);
    expect(
      targets.proteinTarget * 4 +
        targets.fatTarget * 9 +
        targets.carbsTarget * 4,
    ).toBeCloseTo(targets.steady, 0);
  });

  it("limits the extreme deficit to one percent of current body weight per week", () => {
    const targets = calculateTargets({
      ...input,
      weightKg: 50,
      heightCm: 195,
      activityLevel: "active",
    });
    expect(targets.maintenance - targets.extreme).toBe(550);
    expect(targets.maintenance - targets.steady).toBe(275);
    expect(targets.maintenance - targets.mild).toBe(137);
  });

  it("scales all three deficits together when the minimum intake is reached", () => {
    const targets = calculateTargets({
      ...input,
      heightCm: 170,
      weightKg: 70,
      activityLevel: "sedentary",
    });
    expect(targets.extreme).toBe(1_500);
    expect(targets.extreme).toBeLessThan(targets.steady);
    expect(targets.steady).toBeLessThan(targets.mild);
    expect(targets.mild).toBeLessThan(targets.maintenance);
    const female = calculateTargets({
      ...input,
      sex: "female",
      heightCm: 160,
      weightKg: 60,
      activityLevel: "sedentary",
    });
    expect(female.extreme).toBe(1_200);
  });

  it("rejects inappropriate or invalid inputs instead of returning reversed targets", () => {
    expect(() => calculateTargets({ ...input, weightKg: NaN })).toThrow(
      RangeError,
    );
    expect(() => calculateTargets({ ...input, age: 17 })).toThrow(RangeError);
    expect(() =>
      calculateTargets({
        ...input,
        age: 120,
        heightCm: 130,
        weightKg: 35,
        activityLevel: "sedentary",
      }),
    ).toThrow(RangeError);
  });
});

describe("calorie colors", () => {
  const thresholds = {
    extreme: 1_500,
    steady: 1_900,
    mild: 2_100,
    maintenance: 2_300,
  };
  it.each([
    [0, "low"],
    [1_500, "low"],
    [1_500.1, "green"],
    [1_900, "green"],
    [1_900.1, "caution"],
    [2_099.9, "caution"],
    [2_100, "warning"],
    [2_299.9, "warning"],
    [2_300, "danger"],
    [3_000, "danger"],
  ] as const)("maps %s kcal to %s", (calories, expected) => {
    expect(calorieTone(calories, thresholds)).toBe(expected);
  });
});

describe("food quantities", () => {
  it("scales per-100g nutrition without rounding individual entries", () => {
    const food = { calories: 123, protein: 12.3, fat: 3.2, carbs: 9.8 };
    const scaled = scaleNutrients(food, 37.5);
    expect(scaled.calories).toBeCloseTo(46.125, 8);
    expect(scaled.protein).toBeCloseTo(4.6125, 8);
    expect(scaled.fat).toBeCloseTo(1.2, 8);
    expect(scaled.carbs).toBeCloseTo(3.675, 8);
    expect(scaleNutrients(food, 0)).toEqual({
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
    });
    expect(() => scaleNutrients(food, -1)).toThrow(RangeError);
    expect(() => scaleNutrients(food, Infinity)).toThrow(RangeError);
  });

  it("sums nutrients from recorded entries and handles no meals", () => {
    const entries = [
      { id: "a", calories: 100.1, protein: 10, fat: 4, carbs: 6 },
      { id: "b", calories: 200.2, protein: 20, fat: 8, carbs: 12 },
    ];
    expect(sumNutrients(entries)).toMatchObject({
      protein: 30,
      fat: 12,
      carbs: 18,
    });
    expect(sumNutrients(entries).calories).toBeCloseTo(300.3, 8);
    expect(sumNutrients([])).toEqual({
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
    });
  });
});

describe("historical seven-day summary", () => {
  it("uses only the seven preceding complete calendar dates and their own maintenance", () => {
    const summary = summarize(
      [
        day("2026-10-22", { completed: true, calories: 0 }), // too old
        day("2026-10-23", { maintenance: 2_400, calories: 2_000 }),
        day("2026-10-29", { maintenance: 2_600, calories: 2_000 }),
        day("2026-10-30", { completed: true, calories: 0 }), // partial reference day
        day("2026-10-31", { completed: true, calories: 0 }), // future
      ],
      measurement(),
      "2026-10-30",
    );
    expect(summary.includedDays).toBe(2);
    expect(summary.averageDeficit).toBe(500);
    expect(summary.weeklyLossKg).toBeCloseTo(0.45454545);
    expect(summary.projectedDate).toBe("2027-01-15");
  });

  it("excludes low and exactly extreme days unless explicitly completed", () => {
    const summary = summarize(
      [
        day("2026-10-23", { calories: 0, eligible: true }),
        day("2026-10-24", { calories: 1_799, eligible: true }),
        day("2026-10-25", { calories: 1_800, eligible: true }),
        day("2026-10-26", {
          calories: 1_800,
          completed: true,
          eligible: false,
        }),
        day("2026-10-27", {
          calories: 1_000,
          completed: true,
          eligible: false,
        }),
        day("2026-10-28", { calories: 1_801, eligible: false }),
      ],
      measurement(),
      "2026-10-30",
    );
    expect(summary.includedDays).toBe(3);
    expect(summary.averageDeficit).toBeCloseTo((700 + 1_500 + 699) / 3);
  });

  it("does not treat missing days as zero food", () => {
    expect(summarize([], measurement(), "2026-10-30")).toEqual({
      averageDeficit: null,
      includedDays: 0,
      weeklyLossKg: null,
      projectedDate: null,
      targetReached: false,
    });
    expect(
      summarize([day("2026-10-29")], measurement(), "2026-10-30")
        .averageDeficit,
    ).toBe(500);
  });

  it("includes an explicitly completed zero-intake day", () => {
    const summary = summarize(
      [day("2026-10-29", { calories: 0, completed: true })],
      measurement(),
      "2026-10-30",
    );
    expect(summary.includedDays).toBe(1);
    expect(summary.averageDeficit).toBe(2_500);
  });

  it.each([2_500, 2_600])(
    "has no goal date for %s kcal at or above maintenance",
    (calories) => {
      const summary = summarize(
        [day("2026-10-29", { calories })],
        measurement(),
        "2026-10-30",
      );
      expect(summary.projectedDate).toBeNull();
      expect(summary.weeklyLossKg).toBeLessThanOrEqual(0);
    },
  );

  it("returns the viewed date for an already achieved target, including without history", () => {
    const summary = summarize(
      [],
      measurement({ weightKg: 74, targetWeightKg: 75 }),
      "2026-10-30",
    );
    expect(summary.targetReached).toBe(true);
    expect(summary.projectedDate).toBe("2026-10-30");
  });

  it("avoids meaningless or unrepresentable projected dates", () => {
    const summary = summarize(
      [day("2026-10-29", { calories: 2_499.99 })],
      measurement(),
      "2026-10-30",
    );
    expect(summary.projectedDate).toBeNull();
    expect(summary.averageDeficit).toBeGreaterThan(0);
    expect(
      summarize([day("9999-12-19")], measurement(), "9999-12-20").projectedDate,
    ).toBeNull();
  });

  it("ignores invalid history values", () => {
    const summary = summarize(
      [
        day("2026-10-29", { calories: NaN, completed: true }),
        day("2026-10-28", { maintenance: Infinity, completed: true }),
      ],
      measurement(),
      "2026-10-30",
    );
    expect(summary.includedDays).toBe(0);
  });
});
