import { CircleAlert } from "lucide-react";

interface ErrorStateProps {
  title: string;
  description: string;
  onRetry?: () => void;
}

export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <CircleAlert size={24} aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry && (
        <button
          type="button"
          className="button button-secondary"
          onClick={onRetry}
        >
          Retry
        </button>
      )}
    </div>
  );
}
