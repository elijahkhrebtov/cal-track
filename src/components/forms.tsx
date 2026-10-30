"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { errorMessage, request } from "@/components/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Food, Measurement, MeasurementInput, Serving } from "@/lib/types";

export function Field({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="error-notice" role="alert">
      {errorMessage(error)}
    </p>
  );
}

export function SavingLabel({
  saving,
  children,
}: {
  saving: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {saving && <LoaderCircle size={16} className="spin" />}
      {children}
    </>
  );
}

export function MeasurementForm({
  measurement,
  today,
  startDate,
  onSaved,
  onCancel,
}: {
  measurement?: Measurement | null;
  today: string;
  startDate?: string | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [values, setValues] = useState({
    effectiveDate: today,
    sex: measurement?.sex || "male",
    age: measurement?.age.toString() || "",
    heightCm: measurement?.heightCm.toString() || "",
    weightKg: measurement?.weightKg.toString() || "",
    targetWeightKg: measurement?.targetWeightKg.toString() || "",
    activityLevel: measurement?.activityLevel || "moderate",
  });

  const update = (key: keyof typeof values, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: MeasurementInput = {
      effectiveDate: values.effectiveDate,
      sex: values.sex as MeasurementInput["sex"],
      age: Number(values.age),
      heightCm: Number(values.heightCm),
      weightKg: Number(values.weightKg),
      targetWeightKg: Number(values.targetWeightKg),
      activityLevel: values.activityLevel as MeasurementInput["activityLevel"],
    };
    if (
      input.targetWeightKg >= input.weightKg &&
      (!measurement || input.targetWeightKg !== measurement.targetWeightKg)
    ) {
      setError(new Error("Target weight must be below current weight."));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await request<Measurement>("/api/measurements", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await queryClient.invalidateQueries();
      onSaved();
    } catch (cause) {
      setError(cause);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      {measurement && (
        <Field label="Effective date">
          <Input
            type="date"
            required
            min={startDate || undefined}
            max={today}
            value={values.effectiveDate}
            onChange={(event) => update("effectiveDate", event.target.value)}
          />
        </Field>
      )}
      <div className="form-grid">
        <Field label="Current weight" hint="kg">
          <Input
            type="number"
            required
            inputMode="decimal"
            min="30"
            max="350"
            step="0.1"
            placeholder="0.0"
            value={values.weightKg}
            onChange={(event) => update("weightKg", event.target.value)}
          />
        </Field>
        <Field label="Target weight" hint="kg">
          <Input
            type="number"
            required
            inputMode="decimal"
            min="30"
            max="350"
            step="0.1"
            placeholder="0.0"
            value={values.targetWeightKg}
            onChange={(event) => update("targetWeightKg", event.target.value)}
          />
        </Field>
        <Field label="Height" hint="cm">
          <Input
            type="number"
            required
            inputMode="decimal"
            min="100"
            max="250"
            step="0.1"
            placeholder="0"
            value={values.heightCm}
            onChange={(event) => update("heightCm", event.target.value)}
          />
        </Field>
        <Field label="Age" hint="years">
          <Input
            type="number"
            required
            inputMode="numeric"
            min="18"
            max="100"
            step="1"
            placeholder="0"
            value={values.age}
            onChange={(event) => update("age", event.target.value)}
          />
        </Field>
      </div>
      <Field label="Sex">
        <select
          className="input"
          value={values.sex}
          onChange={(event) => update("sex", event.target.value)}
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </Field>
      <Field label="Activity">
        <select
          className="input"
          value={values.activityLevel}
          onChange={(event) => update("activityLevel", event.target.value)}
        >
          <option value="sedentary">Sedentary · little exercise</option>
          <option value="light">Light · 1–2 sessions / week</option>
          <option value="moderate">Moderate · 3 sessions / week</option>
          <option value="active">Active · 5–6 sessions / week</option>
        </select>
      </Field>
      <ErrorNotice error={error} />
      <div className="form-actions">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving} className="flex-fill">
          <SavingLabel saving={saving}>
            {measurement ? "Save measurements" : "Set targets"}
          </SavingLabel>
        </Button>
      </div>
    </form>
  );
}

export function FoodForm({
  food,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  food?: Food;
  onSaved: (food: Food) => void;
  onCancel: () => void;
  onDirtyChange?: () => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState({
    name: food?.name || "",
    calories: food?.calories.toString() || "",
    protein: food?.protein.toString() || "",
    fat: food?.fat.toString() || "",
    carbs: food?.carbs.toString() || "",
  });
  const [servings, setServings] = useState<
    Array<{ id: string; name: string; grams: string }>
  >(() =>
    (food?.servings || []).map((serving) => ({
      ...serving,
      grams: serving.grams.toString(),
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const update = (key: keyof typeof values, value: string) => {
    onDirtyChange?.();
    setValues((previous) => ({ ...previous, [key]: value }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const customServings: Serving[] = servings.map((serving) => ({
      ...serving,
      name: serving.name.trim(),
      grams: Number(serving.grams),
    }));
    try {
      const saved = await request<Food>(
        food ? `/api/foods/${food.id}` : "/api/foods",
        {
          method: food ? "PATCH" : "POST",
          body: JSON.stringify({
            name: values.name.trim(),
            calories: Number(values.calories),
            protein: Number(values.protein),
            fat: Number(values.fat),
            carbs: Number(values.carbs),
            servings: customServings,
          }),
        },
      );
      await queryClient.invalidateQueries({
        queryKey: ["foods"],
        predicate: (query) => query.queryKey[1] !== "external",
      });
      onSaved(saved);
    } catch (cause) {
      setError(cause);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <Field label="Food name">
        <Input
          required
          maxLength={160}
          placeholder="e.g. Greek yogurt"
          value={values.name}
          onChange={(event) => update("name", event.target.value)}
        />
      </Field>
      <div className="form-section-label">
        <span>Nutrition</span>
        <span>per 100 g</span>
      </div>
      <Field label="Calories" hint="kcal">
        <Input
          type="number"
          required
          inputMode="decimal"
          min="0"
          max="1000"
          step="0.1"
          placeholder="0"
          value={values.calories}
          onChange={(event) => update("calories", event.target.value)}
        />
      </Field>
      <div className="form-grid form-grid-three">
        {(
          [
            ["protein", "Protein"],
            ["fat", "Fat"],
            ["carbs", "Carbs"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label} hint="g">
            <Input
              type="number"
              required
              inputMode="decimal"
              min="0"
              max="100"
              step="0.1"
              placeholder="0"
              value={values[key]}
              onChange={(event) => update(key, event.target.value)}
            />
          </Field>
        ))}
      </div>
      <div className="form-section-label">
        <span>Serving sizes</span>
        <span>optional</span>
      </div>
      {servings.map((serving, index) => (
        <div className="serving-row" key={serving.id}>
          <Field label={`Serving ${index + 1}`}>
            <Input
              required
              maxLength={60}
              placeholder="e.g. scoop"
              value={serving.name}
              onChange={(event) => {
                onDirtyChange?.();
                setServings((previous) =>
                  previous.map((item) =>
                    item.id === serving.id
                      ? { ...item, name: event.target.value }
                      : item,
                  ),
                );
              }}
            />
          </Field>
          <Field label="Grams">
            <Input
              type="number"
              inputMode="decimal"
              required
              min="0.1"
              max="10000"
              step="0.1"
              placeholder="0"
              value={serving.grams}
              onChange={(event) => {
                onDirtyChange?.();
                setServings((previous) =>
                  previous.map((item) =>
                    item.id === serving.id
                      ? { ...item, grams: event.target.value }
                      : item,
                  ),
                );
              }}
            />
          </Field>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove serving ${index + 1}`}
            onClick={() => {
              onDirtyChange?.();
              setServings((previous) =>
                previous.filter((item) => item.id !== serving.id),
              );
            }}
          >
            <Trash2 size={17} />
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        className="align-start"
        onClick={() => {
          onDirtyChange?.();
          setServings((previous) => [
            ...previous,
            { id: crypto.randomUUID(), name: "", grams: "" },
          ]);
        }}
      >
        <Plus size={16} />
        Add serving size
      </Button>
      {food && (
        <p className="muted-note">Changes apply to future meal entries.</p>
      )}
      <ErrorNotice error={error} />
      <div className="form-actions">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button className="flex-fill" type="submit" disabled={saving}>
          <SavingLabel saving={saving}>Save food</SavingLabel>
        </Button>
      </div>
    </form>
  );
}
