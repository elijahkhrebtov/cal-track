import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ActivityLevel, MealEntry, Serving } from "@/lib/types";

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  secretHash: text("secret_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    renewedAt: timestamp("renewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sessions_expiry_idx").on(table.expiresAt)],
);

export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(1),
  windowStart: timestamp("window_start", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const measurements = pgTable(
  "measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    effectiveDate: date("effective_date").notNull(),
    sex: text("sex").$type<"male" | "female">().notNull(),
    age: integer("age").notNull(),
    heightCm: doublePrecision("height_cm").notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
    targetWeightKg: doublePrecision("target_weight_kg").notNull(),
    activityLevel: text("activity_level").$type<ActivityLevel>().notNull(),
    activityFactor: doublePrecision("activity_factor").notNull(),
    maintenance: doublePrecision("maintenance").notNull(),
    mild: doublePrecision("mild").notNull(),
    steady: doublePrecision("steady").notNull(),
    extreme: doublePrecision("extreme").notNull(),
    proteinTarget: doublePrecision("protein_target").notNull(),
    fatTarget: doublePrecision("fat_target").notNull(),
    carbsTarget: doublePrecision("carbs_target").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("measurements_effective_idx").on(
      table.accountId,
      table.effectiveDate,
      table.createdAt,
    ),
  ],
);

export const foods = pgTable(
  "foods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    source: text("source").$type<"custom" | "usda">().notNull(),
    externalId: text("external_id"),
    name: text("name").notNull(),
    brand: text("brand"),
    calories: doublePrecision("calories").notNull(),
    protein: doublePrecision("protein").notNull(),
    fat: doublePrecision("fat").notNull(),
    carbs: doublePrecision("carbs").notNull(),
    servings: jsonb("servings").$type<Serving[]>().notNull().default([]),
    archived: boolean("archived").notNull().default(false),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("foods_external_idx").on(
      table.accountId,
      table.source,
      table.externalId,
    ),
    index("foods_recent_idx").on(table.accountId, table.lastUsedAt),
  ],
);

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    name: text("name").notNull(),
    // Immutable food snapshots keep historical meals independent of later food edits.
    entries: jsonb("entries").$type<MealEntry[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("meals_date_idx").on(table.accountId, table.date, table.createdAt),
  ],
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    entries: jsonb("entries").$type<MealEntry[]>().notNull(),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("recipes_account_name_idx").on(table.accountId, table.name),
  ],
);

export const dayCompletions = pgTable(
  "day_completions",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    completed: boolean("completed").notNull().default(false),
  },
  (table) => [
    uniqueIndex("day_completions_date_idx").on(table.accountId, table.date),
  ],
);
