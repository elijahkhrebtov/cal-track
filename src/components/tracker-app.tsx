"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  Scale,
  Utensils,
} from "lucide-react";

import { ApiError, request } from "@/components/api";
import { DashboardSkeleton } from "@/components/loading";
import {
  ErrorNotice,
  Field,
  MeasurementForm,
  SavingLabel,
} from "@/components/forms";
import {
  CustomFoodLibrary,
  MacroLine,
  MealEditor,
  number,
} from "@/components/meal-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { addDays } from "@/lib/dates";
import { calorieTone, sumNutrients } from "@/lib/nutrition";
import type { Bootstrap, Dashboard, DayStat, Meal } from "@/lib/types";

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Leaf size={20} strokeWidth={1.8} />
      </span>
      <span>
        Intake<span className="brand-period">.</span>
      </span>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen" aria-label="Loading">
      <Brand />
      <LoaderCircle size={22} className="spin" />
    </main>
  );
}

function Login() {
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState("");
  const login = useMutation({
    mutationFn: () =>
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ secret }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate();
  }
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Brand />
        <div className="auth-title">
          <span className="auth-icon">
            <LockKeyhole size={22} />
          </span>
          <h1>Sign in</h1>
        </div>
        <form className="form-stack" onSubmit={submit}>
          <Field label="Access key">
            <Input
              type="password"
              required
              autoComplete="current-password"
              name="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="Enter your access key"
            />
          </Field>
          <ErrorNotice error={login.error} />
          <Button type="submit" disabled={login.isPending || !secret}>
            <SavingLabel saving={login.isPending}>
              Continue
              <ChevronRight size={17} />
            </SavingLabel>
          </Button>
        </form>
      </div>
    </main>
  );
}

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const installed = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  if (!prompt) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Install app"
      title="Install app"
      onClick={() => {
        void prompt
          .prompt()
          .then(() => prompt.userChoice)
          .then(() => setPrompt(null));
      }}
    >
      <Download size={19} />
    </Button>
  );
}

function Header({ onLibrary }: { onLibrary?: () => void }) {
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => request("/api/auth/logout", { method: "POST" }),
    onSuccess: () => queryClient.resetQueries(),
  });
  return (
    <header className="app-header">
      <Brand />
      <nav className="header-actions" aria-label="App">
        <InstallButton />
        {onLibrary && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Custom foods"
            title="Custom foods"
            onClick={onLibrary}
          >
            <BookOpen size={19} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {logout.isPending ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <LogOut size={18} />
          )}
        </Button>
      </nav>
      {logout.error && (
        <div className="header-error">
          <ErrorNotice error={logout.error} />
        </div>
      )}
    </header>
  );
}

function Onboarding({ today }: { today: string }) {
  return (
    <div className="app-shell onboarding-shell">
      <Header />
      <main className="onboarding">
        <div className="section-eyebrow">
          <span className="status-dot" />
          Getting started
        </div>
        <h1>Initial measurements</h1>
        <p className="onboarding-note">
          Set your daily calorie and macro targets.
        </p>
        <div className="card onboarding-card">
          <MeasurementForm today={today} onSaved={() => undefined} />
        </div>
      </main>
    </div>
  );
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    ...options,
    timeZone: "UTC",
  });
}

function DateSelector({
  date,
  today,
  startDate,
  onChange,
}: {
  date: string;
  today: string;
  startDate: string;
  onChange: (date: string) => void;
}) {
  const label =
    date === today
      ? "Today"
      : date === addDays(today, -1)
        ? "Yesterday"
        : formatDate(date, { weekday: "long" });
  return (
    <div className="date-navigation">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous day"
        disabled={date <= startDate}
        onClick={() => onChange(addDays(date, -1))}
      >
        <ChevronLeft size={22} />
      </Button>
      <label className="date-picker">
        <span className="date-primary">
          {label}
          <CalendarDays size={15} />
        </span>
        <span className="date-secondary">
          {formatDate(date, { day: "numeric", month: "long", year: "numeric" })}
        </span>
        <input
          type="date"
          aria-label="Select date"
          min={startDate}
          max={today}
          value={date}
          onChange={(event) => {
            const selected = event.target.value;
            if (selected >= startDate && selected <= today) onChange(selected);
          }}
        />
      </label>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next day"
        disabled={date >= today}
        onClick={() => onChange(addDays(date, 1))}
      >
        <ChevronRight size={22} />
      </Button>
    </div>
  );
}

const toneLabels = {
  low: "Below extreme",
  green: "Steady deficit",
  caution: "Above steady target",
  warning: "Mild deficit",
  danger: "At or above maintenance",
} as const;

function CalorieCard({ data }: { data: Dashboard }) {
  const totals = sumNutrients(data.meals);
  const targets = data.measurement;
  const tone = calorieTone(totals.calories, targets);
  const remaining = targets.steady - totals.calories;
  const max = Math.max(targets.maintenance, totals.calories, 1);
  return (
    <section className="card calorie-card" aria-labelledby="calorie-heading">
      <div className="section-heading">
        <h2 id="calorie-heading">Calories</h2>
        <span className={`status-label tone-${tone}`}>
          <span className="status-dot" />
          {toneLabels[tone]}
        </span>
      </div>
      <div className="calorie-values">
        <div className="calorie-main">
          <span className={`calorie-number tone-${tone}`}>
            {number(totals.calories)}
          </span>
          <span className="calorie-target">
            / {number(targets.steady)}
            <small>kcal</small>
          </span>
        </div>
        <div className="remaining-calories">
          <strong>{number(Math.abs(remaining))}</strong>
          <span>{remaining >= 0 ? "remaining" : "over target"}</span>
        </div>
      </div>
      <div
        className="calorie-progress"
        role="meter"
        aria-label="Daily calorie intake"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={totals.calories}
        aria-valuetext={`${number(totals.calories)} of ${number(targets.steady)} kcal steady target`}
      >
        <div
          className={`calorie-progress-fill bg-${tone}`}
          style={{ width: `${Math.min(100, (totals.calories / max) * 100)}%` }}
        />
        <span
          className="calorie-target-marker"
          style={{ left: `${Math.min(99, (targets.steady / max) * 100)}%` }}
        />
      </div>
      <div className="calorie-reference">
        {(
          [
            ["Extreme", targets.extreme],
            ["Mild", targets.mild],
            ["Maintenance", targets.maintenance],
          ] as const
        ).map(([label, amount]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{number(amount)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function MacrosCard({ data }: { data: Dashboard }) {
  const totals = sumNutrients(data.meals);
  const targets = data.measurement;
  const macros = [
    {
      key: "protein",
      label: "Protein",
      value: totals.protein,
      target: targets.proteinTarget,
    },
    { key: "fat", label: "Fat", value: totals.fat, target: targets.fatTarget },
    {
      key: "carbs",
      label: "Carbs",
      value: totals.carbs,
      target: targets.carbsTarget,
    },
  ];
  return (
    <section className="card macros-card" aria-labelledby="macro-heading">
      <div className="section-heading">
        <h2 id="macro-heading">Macros</h2>
        <span className="section-meta">Daily targets</span>
      </div>
      <div className="macro-grid">
        {macros.map((macro) => (
          <div className={`macro-item macro-${macro.key}`} key={macro.key}>
            <div className="macro-label">
              <span className="macro-dot" />
              {macro.label}
            </div>
            <div className="macro-value">
              <strong>{number(macro.value)}</strong>
              <span>
                / {number(macro.target)} <small>g</small>
              </span>
            </div>
            <div
              className="macro-progress"
              role="meter"
              aria-label={`${macro.label} intake`}
              aria-valuemin={0}
              aria-valuemax={Math.max(macro.target, macro.value)}
              aria-valuenow={macro.value}
            >
              <div
                style={{
                  width: `${Math.min(100, macro.target > 0 ? (macro.value / macro.target) * 100 : 0)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MealsCard({
  meals,
  onEdit,
  onAdd,
}: {
  meals: Meal[];
  onEdit: (meal: Meal) => void;
  onAdd: () => void;
}) {
  return (
    <section className="card meals-card" aria-labelledby="meals-heading">
      <div className="section-heading">
        <h2 id="meals-heading">
          Meals<span className="count-badge">{meals.length}</span>
        </h2>
        <Button variant="ghost" size="sm" onClick={onAdd}>
          <Plus size={15} />
          Add
        </Button>
      </div>
      {meals.length ? (
        <div className="meal-list">
          {meals.map((meal) => (
            <button
              className="meal-row"
              onClick={() => onEdit(meal)}
              key={meal.id}
            >
              <span className="meal-row-content">
                <span className="meal-name">{meal.name}</span>
                <MacroLine values={meal} />
              </span>
              <span className="meal-energy">
                <strong>{number(meal.calories)}</strong>
                <span>kcal</span>
              </span>
              <ChevronRight size={16} className="meal-chevron" />
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-icon">
            <Utensils size={23} />
          </span>
          <p>No meals logged</p>
          <button className="text-button" onClick={onAdd}>
            Log your first meal
            <Plus size={14} />
          </button>
        </div>
      )}
    </section>
  );
}

function HistoryChart({
  history,
  date,
  startDate,
  onSelect,
}: {
  history: DayStat[];
  date: string;
  startDate: string;
  onSelect: (date: string) => void;
}) {
  const days = Array.from({ length: 8 }, (_, index) => {
    const day = addDays(date, index - 7);
    return (
      history.find((item) => item.date === day) || {
        date: day,
        calories: 0,
        maintenance: 0,
        mild: 0,
        steady: 0,
        extreme: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        completed: false,
        eligible: false,
      }
    );
  });
  const chartMaximum = Math.max(
    500,
    ...days
      .filter((day) => day.calories > 0 || day.completed)
      .map((day) => Math.abs(day.maintenance - day.calories)),
  );
  return (
    <section className="card chart-card" aria-labelledby="balance-heading">
      <div className="section-heading">
        <h2 id="balance-heading">Energy balance</h2>
        <span className="section-meta">kcal / day</span>
      </div>
      <div className="chart-legend">
        <span>
          <i className="legend-dot" />
          Deficit
        </span>
        <span>
          <i className="legend-dot legend-surplus" />
          Surplus
        </span>
        <span className="chart-range">
          {formatDate(days[0].date, { day: "numeric", month: "short" })} —{" "}
          {formatDate(date, { day: "numeric", month: "short" })}
        </span>
      </div>
      <div className="history-chart">
        <div className="chart-zero-label">0</div>
        <div className="chart-grid-line" />
        <div className="chart-columns">
          {days.map((day) => {
            const deficit = day.maintenance - day.calories;
            const hasData = day.calories > 0 || day.completed;
            const tone = calorieTone(day.calories, day);
            const height = hasData
              ? Math.max(3, (Math.abs(deficit) / chartMaximum) * 64)
              : 0;
            const label = `${formatDate(day.date, { day: "numeric", month: "long" })}: ${hasData ? `${number(day.calories)} kcal, ${number(Math.abs(deficit))} kcal ${deficit >= 0 ? "deficit" : "surplus"}${day.eligible ? "" : ", excluded from average"}` : "no intake logged"}`;
            return (
              <button
                className={`chart-column ${day.date === date ? "chart-selected" : ""}`}
                key={day.date}
                disabled={day.date < startDate}
                aria-label={label}
                title={label}
                onClick={() => onSelect(day.date)}
              >
                <span className="chart-bar-space">
                  <span className="chart-empty-mark" hidden={hasData}>
                    —
                  </span>
                  {hasData && (
                    <span
                      className={`chart-bar bg-${tone} ${!day.eligible && day.date !== date ? "chart-excluded" : ""}`}
                      style={{
                        height: `${height}px`,
                        bottom:
                          deficit >= 0 ? "50%" : `calc(50% - ${height}px)`,
                      }}
                    />
                  )}
                </span>
                <span className="chart-day">
                  {formatDate(day.date, { weekday: "short" }).slice(0, 1)}
                </span>
                <span className="chart-date">
                  {formatDate(day.date, { day: "numeric" })}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="chart-note">
        Past 7 days + selected day. Faded bars are excluded from averages.
      </p>
    </section>
  );
}

function SummaryCard({ data }: { data: Dashboard }) {
  const { summary } = data;
  const deficit = summary.averageDeficit;
  const loss = summary.weeklyLossKg;
  return (
    <section className="card summary-card" aria-labelledby="summary-heading">
      <div className="section-heading">
        <h2 id="summary-heading">Projection</h2>
        <span className="section-meta">
          {summary.includedDays} / 7 days counted
        </span>
      </div>
      <div className="summary-grid">
        <div className="summary-stat">
          <span>
            Average {deficit !== null && deficit < 0 ? "surplus" : "deficit"}
          </span>
          <strong
            className={
              deficit === null
                ? ""
                : deficit > 0
                  ? "text-green"
                  : deficit < 0
                    ? "text-danger"
                    : ""
            }
          >
            {deficit === null ? (
              "—"
            ) : (
              <>
                {deficit > 0 ? (
                  <ArrowDownRight size={19} />
                ) : deficit < 0 ? (
                  <ArrowUpRight size={19} />
                ) : null}
                {number(Math.abs(deficit))}
              </>
            )}
            <small>kcal / day</small>
          </strong>
        </div>
        <div className="summary-stat">
          <span>Projected {loss !== null && loss < 0 ? "gain" : "loss"}</span>
          <strong>
            {loss === null ? "—" : number(Math.abs(loss), 2)}
            <small>kg / week</small>
          </strong>
        </div>
      </div>
      <div className="target-date-row">
        <span className="target-date-icon">
          <Scale size={18} />
        </span>
        <div>
          <span>Target · {number(data.measurement.targetWeightKg, 1)} kg</span>
          <strong>
            {summary.targetReached
              ? "Target reached"
              : summary.projectedDate
                ? formatDate(summary.projectedDate, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : deficit === null
                  ? "Not enough complete days"
                  : "No projected date"}
          </strong>
        </div>
        {summary.projectedDate && (
          <span className="estimated-badge">Estimate</span>
        )}
      </div>
      <p className="muted-note">
        Based on the 7 complete days before{" "}
        {data.date === data.today
          ? "today"
          : formatDate(data.date, { day: "numeric", month: "short" })}
        . Assumes the same average deficit.
      </p>
    </section>
  );
}

function DayCompletion({ data }: { data: Dashboard }) {
  const queryClient = useQueryClient();
  const calories = sumNutrients(data.meals).calories;
  const automaticallyCounted = calories > data.measurement.extreme;
  const mutation = useMutation({
    mutationFn: () =>
      request(`/api/days/${data.date}`, {
        method: "PUT",
        body: JSON.stringify({ completed: !data.completed }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  return (
    <section className="completion-section">
      <div className="completion-row">
        <span
          className={`completion-icon ${data.completed ? "is-complete" : ""}`}
        >
          {data.completed ? <CheckCheck size={20} /> : <Check size={20} />}
        </span>
        <div className="completion-content">
          <strong>
            {data.completed ? "Day marked complete" : "Day completion"}
          </strong>
          <p>
            {data.completed
              ? "Included in averages, even below extreme."
              : automaticallyCounted
                ? "Included automatically in future averages."
                : "Below extreme. Excluded unless marked complete."}
          </p>
        </div>
        <Button
          variant={data.completed ? "secondary" : "ghost"}
          size="sm"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <SavingLabel saving={mutation.isPending}>
            {data.completed ? "Undo" : "Mark complete"}
          </SavingLabel>
        </Button>
      </div>
      <ErrorNotice error={mutation.error} />
    </section>
  );
}

function DailyDashboard({ bootstrap }: { bootstrap: Bootstrap }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ meal?: Meal } | null>(null);
  const [library, setLibrary] = useState(false);
  const [measurements, setMeasurements] = useState(false);
  const date = selected || bootstrap.today;
  const result = useQuery({
    queryKey: ["dashboard", date],
    queryFn: ({ signal }) =>
      request<Dashboard>(`/api/dashboard?date=${date}`, { signal }),
  });
  const data = result.data;

  return (
    <div className="app-shell">
      <Header onLibrary={() => setLibrary(true)} />
      <main className="dashboard-main">
        <DateSelector
          date={date}
          today={bootstrap.today}
          startDate={bootstrap.startDate!}
          onChange={setSelected}
        />
        {result.isPending ? (
          <DashboardSkeleton />
        ) : result.error ? (
          <div className="card error-card">
            <ErrorNotice error={result.error} />
            <Button variant="secondary" onClick={() => void result.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          data && (
            <>
              <CalorieCard data={data} />
              <MacrosCard data={data} />
              <MealsCard
                meals={data.meals}
                onEdit={(meal) => setEditor({ meal })}
                onAdd={() => setEditor({})}
              />
              <HistoryChart
                history={data.history}
                date={date}
                startDate={data.startDate}
                onSelect={setSelected}
              />
              <SummaryCard data={data} />
              <DayCompletion key={date} data={data} />
              <button
                className="weight-update-button"
                onClick={() => setMeasurements(true)}
              >
                <span className="weight-update-icon">
                  <Scale size={20} />
                </span>
                <span>
                  <strong>Update measurements</strong>
                  <span>
                    {number(data.measurement.weightKg, 1)} kg
                    <span className="weight-arrow">→</span>
                    {number(data.measurement.targetWeightKg, 1)} kg target
                  </span>
                </span>
                <ChevronRight size={18} />
              </button>
              <div className="dashboard-footer">
                <span className="status-dot" />
                Tashkent · kcal · metric
              </div>
            </>
          )
        )}
      </main>
      <Button
        className="log-meal-fab"
        aria-label="Log meal"
        disabled={!data}
        onClick={() => setEditor({})}
      >
        <Plus size={25} />
        <span>Log meal</span>
      </Button>
      {editor && data && (
        <MealEditor
          key={`${date}:${editor.meal?.id || "new"}`}
          date={date}
          meal={editor.meal}
          meals={data.meals}
          onClose={() => setEditor(null)}
        />
      )}
      {library && <CustomFoodLibrary onClose={() => setLibrary(false)} />}
      {measurements && data && (
        <Sheet open onOpenChange={setMeasurements} title="Update measurements">
          <div className="sheet-scroll">
            <MeasurementForm
              measurement={bootstrap.measurement}
              today={bootstrap.today}
              startDate={data.startDate}
              onSaved={() => setMeasurements(false)}
              onCancel={() => setMeasurements(false)}
            />
          </div>
        </Sheet>
      )}
    </div>
  );
}

export default function TrackerApp() {
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: ({ signal }) => request<Bootstrap>("/api/bootstrap", { signal }),
    retry: (attempt, error) =>
      !(error instanceof ApiError && error.status === 401) && attempt < 1,
  });
  if (bootstrap.isPending) return <LoadingScreen />;
  if (bootstrap.error instanceof ApiError && bootstrap.error.status === 401)
    return <Login />;
  if (bootstrap.error)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <Brand />
          <ErrorNotice error={bootstrap.error} />
          <Button variant="secondary" onClick={() => void bootstrap.refetch()}>
            Try again
          </Button>
        </div>
      </main>
    );
  if (!bootstrap.data?.measurement)
    return <Onboarding today={bootstrap.data!.today} />;
  return <DailyDashboard bootstrap={bootstrap.data} />;
}
