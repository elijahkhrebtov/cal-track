import { Skeleton } from "@/components/ui/skeleton";

export function FoodListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          className="food-row food-row-skeleton"
          aria-hidden="true"
          key={index}
        >
          <div className="food-row-text">
            <Skeleton
              className={`skeleton-food-name skeleton-food-name-${index}`}
            />
            <div className="food-meta">
              <Skeleton className="skeleton-food-badge" />
              <Skeleton className="skeleton-food-brand" />
            </div>
          </div>
          <Skeleton className="skeleton-food-arrow" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" role="status" aria-label="Loading day">
      <span className="sr-only">Loading day</span>
      <div className="card calorie-card" aria-hidden="true">
        <div className="skeleton-heading-row">
          <Skeleton className="skeleton-heading" />
          <Skeleton className="skeleton-caption" />
        </div>
        <div className="calorie-values">
          <Skeleton className="skeleton-calorie-number" />
          <Skeleton className="skeleton-calorie-remaining" />
        </div>
        <Skeleton className="skeleton-progress" />
        <div className="calorie-reference">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton className="skeleton-reference" key={index} />
          ))}
        </div>
      </div>
      <div className="card macros-card" aria-hidden="true">
        <div className="skeleton-heading-row">
          <Skeleton className="skeleton-heading" />
          <Skeleton className="skeleton-caption" />
        </div>
        <div className="macro-grid">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="skeleton-macro" key={index}>
              <Skeleton className="skeleton-caption" />
              <Skeleton className="skeleton-macro-value" />
              <Skeleton className="skeleton-progress" />
            </div>
          ))}
        </div>
      </div>
      <div className="card meals-card" aria-hidden="true">
        <Skeleton className="skeleton-heading" />
        <FoodListSkeleton label="Loading meals" />
      </div>
      <div className="card chart-card" aria-hidden="true">
        <Skeleton className="skeleton-heading" />
        <Skeleton className="skeleton-chart" />
      </div>
      <div className="card summary-card" aria-hidden="true">
        <Skeleton className="skeleton-heading" />
        <div className="summary-grid">
          <Skeleton className="skeleton-summary-value" />
          <Skeleton className="skeleton-summary-value" />
        </div>
        <Skeleton className="skeleton-goal" />
      </div>
    </div>
  );
}
