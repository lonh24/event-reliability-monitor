import { Unplug } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { DataTable } from "./DataTable";
import { StatusBadge } from "./StatusBadge";

interface PlaceholderPanelProps {
  title: string;
  description: string;
  columns?: ComponentProps<typeof DataTable>["columns"];
  action?: ReactNode;
}

export function PlaceholderPanel({
  title,
  description,
  columns,
  action,
}: PlaceholderPanelProps) {
  const state = (
    <EmptyState
      icon={Unplug}
      title="Data source not connected"
      description={description}
      action={action}
    />
  );
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-header">
        <h2>{title}</h2>
        <StatusBadge label="Not connected" />
      </div>
      {columns ? (
        <DataTable caption={title} columns={columns} emptyState={state} />
      ) : (
        state
      )}
    </section>
  );
}
