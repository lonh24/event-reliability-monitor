import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description: string;
  action?: ReactNode;
  backLink?: ReactNode;
}

export function PageHeader({
  title,
  description,
  action,
  backLink,
}: PageHeaderProps) {
  return (
    <div className="page-header">
      {backLink}
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Event Reliability Monitor</p>
          <h1>{title}</h1>
          <p className="page-description">{description}</p>
        </div>
        {action && <div className="page-action">{action}</div>}
      </div>
    </div>
  );
}
