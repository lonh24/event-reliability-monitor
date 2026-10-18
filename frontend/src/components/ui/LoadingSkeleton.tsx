interface LoadingSkeletonProps {
  variant?: "card" | "table" | "detail";
  label?: string;
}

export function LoadingSkeleton({
  variant = "card",
  label = "Loading content",
}: LoadingSkeletonProps) {
  return (
    <div className={`loading-skeleton skeleton-${variant}`} role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        {Array.from({ length: variant === "card" ? 2 : 4 }, (_, index) => (
          <span className="skeleton-line" key={index} />
        ))}
      </div>
    </div>
  );
}
