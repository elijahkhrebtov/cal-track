import { z } from "zod";
import { isDateString } from "@/lib/dates";

export const dateSchema = z
  .string()
  .refine(isDateString, "Use a valid YYYY-MM-DD date.");
const nutrient = z.number().finite().min(0).max(10_000);

export const measurementSchema = z.object({
  effectiveDate: dateSchema,
  sex: z.enum(["male", "female"]),
  age: z.number().int().min(18).max(100),
  heightCm: z.number().finite().min(100).max(250),
  weightKg: z.number().finite().min(30).max(350),
  targetWeightKg: z.number().finite().min(30).max(350),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active"]),
});

export const customFoodSchema = z.object({
  name: z.string().trim().min(1).max(200),
  calories: nutrient.max(1_000),
  protein: nutrient.max(100),
  fat: nutrient.max(100),
  carbs: nutrient.max(100),
  servings: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().trim().min(1).max(80),
        grams: z.number().finite().positive().max(100_000),
      }),
    )
    .max(30)
    .default([]),
});

export const foodReferenceSchema = z.object({
  id: z.string().min(1).max(100),
  source: z.enum(["custom", "usda"]),
  externalId: z.string().max(100).nullable(),
});

export const mealSchema = z.object({
  id: z.uuid().optional(),
  date: dateSchema,
  name: z.string().trim().min(1).max(120),
  entries: z
    .array(
      z.object({
        id: z.string().max(100).optional(),
        food: foodReferenceSchema,
        grams: z.number().finite().positive().max(100_000),
        quantity: z.number().finite().positive().max(100_000),
        servingName: z.string().trim().min(1).max(100),
      }),
    )
    .min(1, "Add at least one food.")
    .max(100),
});
