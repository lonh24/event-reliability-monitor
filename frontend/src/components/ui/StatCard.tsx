import type { LucideIcon } from "lucide-react";
import type { SemanticTone } from "./StatusBadge";
import { LoadingSkeleton } from "./LoadingSkeleton";

interface StatCardProps {
  label: string;
  value: string | number | null;
  description: string;
  icon: LucideIcon;
  tone?: SemanticTone;
  loading?: boolean;
}

export function StatCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "neutral",
  loading = false,
}: StatCardProps) {
  return (
    <article className={`stat-card stat-${tone}`} aria-label={label}>
      <div className="stat-heading">
        <h2>{label}</h2>
        <Icon size={18} aria-hidden="true" />
      </div>
      {loading ? (
        <LoadingSkeleton label={`Loading ${label}`} />
      ) : (
        <p className="stat-value">
          {value === null ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">Unavailable</span>
            </>
          ) : (
            value
          )}
        </p>
      )}
      <p className="stat-description">{description}</p>
    </article>
  );
}
