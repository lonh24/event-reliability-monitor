import { Children, type ReactNode } from "react";

interface TableColumn {
  id: string;
  label: string;
}
interface DataTableProps {
  caption: string;
  columns: readonly TableColumn[];
  children?: ReactNode;
  emptyState: ReactNode;
}

// Composable presentation: callers provide semantic <tr>/<td> rows and stable keys.
// Absence of children renders the supplied state; it does not infer an empty dataset.
export function DataTable({
  caption,
  columns,
  children,
  emptyState,
}: DataTableProps) {
  const hasRows = Children.count(children) > 0;
  return (
    <div>
      <div
        className="table-scroll"
        role="region"
        aria-label={caption}
        tabIndex={0}
      >
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map(({ id, label }) => (
                <th key={id} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {!hasRows && emptyState}
    </div>
  );
}
