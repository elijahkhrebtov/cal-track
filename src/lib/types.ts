export interface Nutrients {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export type FoodSource = "custom" | "usda";

export interface Serving {
  id: string;
  name: string;
  grams: number;
}

export interface Food extends Nutrients {
  id: string;
  source: FoodSource;
  externalId: string | null;
  name: string;
  brand: string | null;
  servings: Serving[];
}

export interface MealEntry extends Nutrients {
  id: string;
  foodId: string;
  food: Food;
  grams: number;
  quantity: number;
  servingName: string;
}

export interface Meal extends Nutrients {
  id: string;
  date: string;
  name: string;
  createdAt: string;
  entries: MealEntry[];
}

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active";

export interface MeasurementInput {
  effectiveDate: string;
  sex: "male" | "female";
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
}

export interface Measurement extends MeasurementInput {
  id: string;
  createdAt: string;
  activityFactor: number;
  maintenance: number;
  mild: number;
  steady: number;
  extreme: number;
  proteinTarget: number;
  fatTarget: number;
  carbsTarget: number;
}

export interface DayStat extends Nutrients {
  date: string;
  maintenance: number;
  mild: number;
  steady: number;
  extreme: number;
  completed: boolean;
  eligible: boolean;
}

export interface Summary {
  averageDeficit: number | null;
  includedDays: number;
  weeklyLossKg: number | null;
  projectedDate: string | null;
  targetReached: boolean;
}

export interface Bootstrap {
  today: string;
  startDate: string | null;
  measurement: Measurement | null;
}

export interface Dashboard {
  date: string;
  today: string;
  startDate: string;
  measurement: Measurement;
  meals: Meal[];
  completed: boolean;
  history: DayStat[];
  summary: Summary;
}
