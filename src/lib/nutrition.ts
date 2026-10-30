import { addDays, daysBefore, isDateString } from "./dates";
import type {
  DayStat,
  Measurement,
  MeasurementInput,
  Nutrients,
  Summary,
} from "./types";

export const DEFAULT_ACTIVITY_LEVEL = "moderate" as const;
export const KCAL_PER_KG = 7_700;

export const ACTIVITY_FACTORS: Record<
  MeasurementInput["activityLevel"],
  number
> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export type CalorieTone = "low" | "green" | "caution" | "warning" | "danger";
type Thresholds = Pick<
  Measurement,
  "maintenance" | "mild" | "steady" | "extreme"
>;
type Targets = Thresholds &
  Pick<
    Measurement,
    "activityFactor" | "proteinTarget" | "fatTarget" | "carbsTarget"
  >;

/** Derived estimates are saved with each measurement, so earlier targets stay intact. */
export function calculateTargets(input: MeasurementInput): Targets {
  const { age, heightCm, weightKg, targetWeightKg, sex, activityLevel } = input;
  if (
    ![age, heightCm, weightKg, targetWeightKg].every(Number.isFinite) ||
    age < 18 ||
    age > 120 ||
    heightCm <= 0 ||
    weightKg <= 0 ||
    targetWeightKg <= 0 ||
    (sex !== "male" && sex !== "female") ||
    !Object.hasOwn(ACTIVITY_FACTORS, activityLevel)
  ) {
    throw new RangeError(
      "Valid adult measurements and an activity level are required.",
    );
  }

  const activityFactor = ACTIVITY_FACTORS[activityLevel];
  const restingCalories =
    10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
  const maintenance = Math.round(restingCalories * activityFactor);
  const minimumIntake = sex === "male" ? 1_500 : 1_200;
  if (!Number.isFinite(maintenance) || maintenance <= minimumIntake + 4) {
    throw new RangeError(
      "Estimated maintenance is too low to calculate these weight-loss targets.",
    );
  }

  // One percent/week is an upper reference, further limited by maintenance and intake floor.
  // Scaling all three deficits together preserves their order when a cap is reached.
  const extremeDeficit = Math.min(
    (weightKg * 0.01 * KCAL_PER_KG) / 7,
    maintenance * 0.3,
    maintenance - minimumIntake,
  );
  const mild = Math.round(maintenance - extremeDeficit * 0.25);
  const steady = Math.round(maintenance - extremeDeficit * 0.5);
  const extreme = Math.round(maintenance - extremeDeficit);
  if (!(extreme < steady && steady < mild && mild < maintenance)) {
    throw new RangeError(
      "These measurements cannot produce distinct weight-loss targets.",
    );
  }

  return {
    activityFactor,
    maintenance,
    mild,
    steady,
    extreme,
    // High-protein, lower-carb preference: protein/fat/carbohydrate = 40/35/25%.
    proteinTarget: roundToTenth((steady * 0.4) / 4),
    fatTarget: roundToTenth((steady * 0.35) / 9),
    carbsTarget: roundToTenth((steady * 0.25) / 4),
  };
}

export function calorieTone(
  calories: number,
  targets: Thresholds,
): CalorieTone {
  if (calories <= targets.extreme) return "low";
  if (calories <= targets.steady) return "green";
  if (calories < targets.mild) return "caution";
  if (calories < targets.maintenance) return "warning";
  return "danger";
}

export function sumNutrients(items: readonly Nutrients[]): Nutrients {
  return items.reduce<Nutrients>(
    (total, item) => ({
      calories: total.calories + item.calories,
      protein: total.protein + item.protein,
      fat: total.fat + item.fat,
      carbs: total.carbs + item.carbs,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );
}

/** Food nutrition is always expressed per 100 grams. Keep precision until display. */
export function scaleNutrients(food: Nutrients, grams: number): Nutrients {
  if (!Number.isFinite(grams) || grams < 0) {
    throw new RangeError("Food amount must be a non-negative number of grams.");
  }
  const scale = grams / 100;
  return {
    calories: food.calories * scale,
    protein: food.protein * scale,
    fat: food.fat * scale,
    carbs: food.carbs * scale,
  };
}

export function summarize(
  history: DayStat[],
  measurement: Measurement,
  asOfDate: string,
): Summary {
  if (!isDateString(asOfDate))
    throw new RangeError("A valid summary date is required.");

  const window = new Set(daysBefore(asOfDate, 7));
  const included = history.filter(
    (day) =>
      window.has(day.date) &&
      Number.isFinite(day.calories) &&
      day.calories >= 0 &&
      Number.isFinite(day.maintenance) &&
      day.maintenance > 0 &&
      Number.isFinite(day.extreme) &&
      (day.completed || day.calories > day.extreme),
  );
  const targetReached = measurement.weightKg <= measurement.targetWeightKg;
  if (included.length === 0) {
    return {
      averageDeficit: null,
      includedDays: 0,
      weeklyLossKg: null,
      projectedDate: targetReached ? asOfDate : null,
      targetReached,
    };
  }

  // Each day uses its own effective maintenance, rather than today's measurements.
  const averageDeficit =
    included.reduce((total, day) => total + day.maintenance - day.calories, 0) /
    included.length;
  const weeklyLossKg = (averageDeficit * 7) / KCAL_PER_KG;
  let projectedDate: string | null = targetReached ? asOfDate : null;

  if (!targetReached && averageDeficit > 0) {
    const remainingKg = measurement.weightKg - measurement.targetWeightKg;
    const daysToGoal = Math.ceil((remainingKg * KCAL_PER_KG) / averageDeficit);
    // A century-long estimate carries no useful precision and may overflow a calendar date.
    if (
      Number.isFinite(daysToGoal) &&
      daysToGoal <= 36_525 &&
      asOfDate <= addDays("9999-12-31", -daysToGoal)
    ) {
      projectedDate = addDays(asOfDate, Math.max(1, daysToGoal));
    }
  }

  return {
    averageDeficit,
    includedDays: included.length,
    weeklyLossKg,
    projectedDate,
    targetReached,
  };
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
