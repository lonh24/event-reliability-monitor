import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { DataTable } from "../components/ui/DataTable";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { StatusBadge } from "../components/ui/StatusBadge";
import {
  requestErrorMessage,
  statusTone,
  utcTime,
} from "../components/monitoring/presentation";
import { useApiResource } from "../hooks/useApiResource";
import { monitorApi, type MonitorApi } from "../services/index";
import type { IncidentsQuery } from "../services/monitorApi";
import type { IncidentStatus } from "../types/api";

const statuses: IncidentStatus[] = ["OPEN", "INVESTIGATING", "RESOLVED"];
const severities = ["MEDIUM", "HIGH"] as const;
const initialQuery: IncidentsQuery = {
  page: 0,
  size: 2,
  status: "",
  severity: "",
  sort: "openedAt,desc",
};

export function IncidentsPage({ api = monitorApi }: { api?: MonitorApi }) {
  const [query, setQuery] = useState<IncidentsQuery>(initialQuery);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await api.listIncidents(query, { signal });
      if (
        result.page > 0 &&
        result.page >= result.totalPages &&
        !signal.aborted
      ) {
        return api.listIncidents(
          { ...query, page: Math.max(0, result.totalPages - 1) },
          { signal },
        );
      }
      return result;
    },
    [api, query],
  );
  const resource = useApiResource(load);
  const data = resource.phase === "success" ? resource.data : null;
  const hasFilters = Boolean(query.status || query.severity);
  const clear = () => setQuery(initialQuery);
  const filter = (change: Partial<IncidentsQuery>) =>
    setQuery((previous) => ({ ...previous, ...change, page: 0 }));
  return (
    <>
      <PageHeader
        title="Incidents"
        description="Investigate evidence-backed violations and track each case through resolution."
      />
      <section
        className="panel incidents-panel"
        aria-labelledby="incidents-title"
      >
        <div className="panel-header">
          <h2 id="incidents-title">Investigation queue</h2>
          <span className="eyebrow">Demo data · latest opened first</span>
        </div>
        <div className="filter-bar">
          <label>
            Incident status
            <select
              aria-label="Incident status"
              value={query.status}
              onChange={(event) =>
                filter({
                  status:
                    statuses.find((status) => status === event.target.value) ??
                    "",
                })
              }
            >
              <option value="">All incident statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Severity
            <select
              aria-label="Severity"
              value={query.severity}
              onChange={(event) =>
                filter({
                  severity:
                    severities.find(
                      (severity) => severity === event.target.value,
                    ) ?? "",
                })
              }
            >
              <option value="">All severities</option>
              {severities.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button-secondary"
            onClick={clear}
            disabled={!hasFilters}
          >
            Clear filters
          </button>
        </div>
        <div aria-live="polite" aria-busy={resource.phase === "loading"}>
          {resource.phase === "loading" && (
            <div className="panel-body">
              <LoadingSkeleton variant="table" label="Loading incidents" />
            </div>
          )}
          {resource.phase === "error" && (
            <ErrorState
              title="Could not load incidents"
              description={requestErrorMessage(resource.error)}
              onRetry={resource.retry}
            />
          )}
          {data && (
            <>
              <DataTable
                caption="Incident investigation queue"
                columns={[
                  { id: "summary", label: "Incident / summary" },
                  { id: "app", label: "Application" },
                  { id: "rule", label: "Primary monitoring rule" },
                  { id: "severity", label: "Severity" },
                  { id: "status", label: "Incident status" },
                  { id: "opened", label: "Opened at · UTC" },
                  { id: "event", label: "Linked event" },
                ]}
                emptyState={
                  <EmptyState
                    icon={ShieldAlert}
                    title={
                      hasFilters
                        ? "No matching incidents"
                        : "No incidents recorded"
                    }
                    description={
                      hasFilters
                        ? "No cases match both status and severity conditions."
                        : "The dataset loaded successfully and contains no incident records."
                    }
                    action={
                      hasFilters ? (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={clear}
                        >
                          Clear filters
                        </button>
                      ) : undefined
                    }
                  />
                }
              >
                {data.items.map((incident) => (
                  <tr key={incident.id}>
                    <td>
                      <Link
                        className="text-link"
                        to={`/incidents/${encodeURIComponent(incident.id)}`}
                      >
                        {incident.id}
                      </Link>
                      <p className="cell-description">{incident.summary}</p>
                    </td>
                    <td>
                      {incident.applicationName}
                      <small className="cell-description">
                        {incident.applicationId}
                      </small>
                    </td>
                    <td>
                      {incident.primaryRule.name}
                      <small className="cell-description">
                        {incident.primaryRule.id} ·{" "}
                        {incident.primaryRule.ruleType}
                      </small>
                    </td>
                    <td>
                      <StatusBadge
                        label={incident.severity}
                        tone={statusTone(incident.severity)}
                      />
                    </td>
                    <td>
                      <StatusBadge
                        label={incident.status}
                        tone={statusTone(incident.status)}
                      />
                    </td>
                    <td className="nowrap">{utcTime(incident.openedAt)}</td>
                    <td>
                      <Link
                        className="text-link"
                        to={`/events/${encodeURIComponent(incident.observedEventId)}`}
                      >
                        {incident.eventId}
                      </Link>
                      <small className="cell-description">
                        Observed ID: {incident.observedEventId}
                      </small>
                    </td>
                  </tr>
                ))}
              </DataTable>
              <nav className="pagination" aria-label="Incidents pagination">
                <span role="status">
                  {data.totalItems} incidents ·{" "}
                  {data.totalPages
                    ? `Page ${data.page + 1} of ${data.totalPages}`
                    : "No pages"}
                </span>
                <div>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={data.page === 0}
                    onClick={() =>
                      setQuery((previous) => ({
                        ...previous,
                        page: data.page - 1,
                      }))
                    }
                  >
                    <ChevronLeft size={14} aria-hidden="true" />
                    Previous
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={data.page + 1 >= data.totalPages}
                    onClick={() =>
                      setQuery((previous) => ({
                        ...previous,
                        page: data.page + 1,
                      }))
                    }
                  >
                    Next
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </nav>
            </>
          )}
        </div>
      </section>
      <p className="context-note">
        Resolving a case changes its investigation status. It does not repair
        business data. Demo changes reset on reload.
      </p>
    </>
  );
}
