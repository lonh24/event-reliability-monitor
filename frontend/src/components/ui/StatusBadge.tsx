export type SemanticTone =
  | "success"
  | "danger"
  | "warning"
  | "neutral"
  | "disabled";

interface StatusBadgeProps {
  label: string;
  tone?: SemanticTone;
}

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span className={`status-badge tone-${tone}`}>
      <span className="badge-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
