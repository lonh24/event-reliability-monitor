import { useCallback, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { DataTable } from "../components/ui/DataTable";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { RuleRow } from "../components/monitoring/RuleRow";
import { applicationDirectory } from "../components/monitoring/applicationDirectory";
import { requestErrorMessage } from "../components/monitoring/presentation";
import { useApiResource } from "../hooks/useApiResource";
import { monitorApi, type MonitorApi } from "../services/index";
import type { RulesQuery } from "../services/monitorApi";
const initialQuery: RulesQuery = {
  page: 0,
  size: 3,
  applicationId: "",
  sort: "name,asc",
};
export function RulesPage({ api = monitorApi }: { api?: MonitorApi }) {
  const [query, setQuery] = useState(initialQuery);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await api.listRules(query, { signal });
      if (
        result.page > 0 &&
        result.page >= result.totalPages &&
        !signal.aborted
      )
        return api.listRules(
          { ...query, page: Math.max(0, result.totalPages - 1) },
          { signal },
        );
      return result;
    },
    [api, query],
  );
  const resource = useApiResource(load);
  const loadApps = useCallback(
    (signal: AbortSignal) => applicationDirectory(api, signal),
    [api],
  );
  const apps = useApiResource(loadApps);
  const data = resource.phase === "success" ? resource.data : null;
  return (
    <>
      <PageHeader
        title="Monitoring Rules"
        description="Understand the conditions used to evaluate event reliability."
      />
      <section className="panel rules-panel" aria-labelledby="rules-title">
        <div className="panel-header">
          <h2 id="rules-title">Rule configurations</h2>
          <span className="eyebrow">Demo data</span>
        </div>
        <div className="filter-bar">
          <label>
            Application
            <select
              aria-label="Application"
              value={query.applicationId}
              disabled={apps.phase !== "success"}
              onChange={(e) =>
                setQuery((previous) => ({
                  ...previous,
                  applicationId: e.target.value,
                  page: 0,
                }))
              }
            >
              <option value="">
                {apps.phase === "loading"
                  ? "Loading applications…"
                  : apps.phase === "error"
                    ? "Applications unavailable"
                    : "All applications"}
              </option>
              {apps.phase === "success" &&
                apps.data.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Rule order
            <select
              aria-label="Rule order"
              value={query.sort}
              onChange={(e) =>
                setQuery((previous) => ({
                  ...previous,
                  sort:
                    e.target.value === "name,desc" ? "name,desc" : "name,asc",
                  page: 0,
                }))
              }
            >
              <option value="name,asc">Name A–Z</option>
              <option value="name,desc">Name Z–A</option>
            </select>
          </label>
          <button
            className="button button-secondary"
            type="button"
            disabled={!query.applicationId}
            onClick={() =>
              setQuery((previous) => ({
                ...previous,
                applicationId: "",
                page: 0,
              }))
            }
          >
            Clear filter
          </button>
        </div>
        {apps.phase === "error" && (
          <ErrorState
            title="Application names unavailable"
            description="Rule IDs and configurations remain available. Retry to load application names and filters."
            onRetry={apps.retry}
          />
        )}
        <div aria-live="polite" aria-busy={resource.phase === "loading"}>
          {resource.phase === "loading" && (
            <div className="panel-body">
              <LoadingSkeleton variant="table" label="Loading rules" />
            </div>
          )}
          {resource.phase === "error" && (
            <ErrorState
              title="Could not load rules"
              description={requestErrorMessage(resource.error)}
              onRetry={resource.retry}
            />
          )}
          {data && (
            <>
              <DataTable
                caption="Monitoring rules"
                columns={[
                  { id: "rule", label: "Rule / description" },
                  { id: "app", label: "Application" },
                  { id: "config", label: "Type / configuration" },
                  { id: "enabled", label: "Enabled state" },
                  { id: "version", label: "Configuration / updated · UTC" },
                  { id: "related", label: "Related resources" },
                ]}
                emptyState={
                  <EmptyState
                    icon={SlidersHorizontal}
                    title="No rules configured"
                    description="The rules loaded successfully. This application or dataset has no matching rules."
                  />
                }
              >
                {data.items.map((rule) => (
                  <RuleRow
                    key={`${rule.id}:${rule.updatedAt}`}
                    initial={rule}
                    api={api}
                    applicationName={
                      apps.phase === "success"
                        ? apps.data.find((app) => app.id === rule.applicationId)
                            ?.name
                        : undefined
                    }
                  />
                ))}
              </DataTable>
              <nav className="pagination" aria-label="Rules pagination">
                <span role="status">
                  {data.totalItems} rules ·{" "}
                  {data.totalPages === 0
                    ? "No pages"
                    : `Page ${data.page + 1} of ${data.totalPages}`}
                </span>
                <div>
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={data.page === 0}
                    onClick={() =>
                      setQuery((previous) => ({
                        ...previous,
                        page: data.page - 1,
                      }))
                    }
                  >
                    Previous
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={data.page + 1 >= data.totalPages}
                    onClick={() =>
                      setQuery((previous) => ({
                        ...previous,
                        page: data.page + 1,
                      }))
                    }
                  >
                    Next
                  </button>
                </div>
              </nav>
            </>
          )}
        </div>
      </section>
      <p className="context-note">
        Changing enabled state does not rewrite historical evaluations, resolve
        incidents, repair ledger data or replay events. Config version follows
        the API; it is not an incident revision. Full browser reload resets demo
        changes.
      </p>
    </>
  );
}
