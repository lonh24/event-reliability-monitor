import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { DataTable } from "../components/ui/DataTable";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { StatusBadge } from "../components/ui/StatusBadge";
import { RuleOutcomes } from "../components/monitoring/RuleOutcomes";
import {
  statusTone,
  utcTime,
  requestErrorMessage,
} from "../components/monitoring/presentation";
import { useApiResource } from "../hooks/useApiResource";
import { monitorApi, type MonitorApi } from "../services/index";
import type { EventsQuery } from "../services/monitorApi";
import type { ApplicationResponse, ProcessingStatus } from "../types/api";

const statuses: ProcessingStatus[] = [
  "CONFIRMED",
  "FAILED",
  "PENDING",
  "UNKNOWN",
];
const initialQuery: EventsQuery = {
  search: "",
  applicationId: "",
  status: "",
  page: 0,
  size: 10,
  sort: "occurredAt,desc",
};

export function EventsPage({ api = monitorApi }: { api?: MonitorApi }) {
  const [query, setQuery] = useState<EventsQuery>(initialQuery);
  const [searchInput, setSearchInput] = useState("");
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await api.listEvents(query, { signal });
      if (
        result.page > 0 &&
        result.page >= result.totalPages &&
        !signal.aborted
      ) {
        return api.listEvents(
          { ...query, page: Math.max(0, result.totalPages - 1) },
          { signal },
        );
      }
      return result;
    },
    [api, query],
  );
  const resource = useApiResource(load);
  const loadApps = useCallback(
    async (signal: AbortSignal) => {
      const items: ApplicationResponse[] = [];
      let page = 0;
      for (;;) {
        const result = await api.listApplications(
          { page, size: 100, sort: "createdAt,asc" },
          { signal },
        );
        items.push(...result.items);
        if (++page >= result.totalPages) return items;
      }
    },
    [api],
  );
  const applications = useApiResource(loadApps);
  const data = resource.phase === "success" ? resource.data : null;
  const hasFilters = Boolean(
    query.search || query.applicationId || query.status,
  );
  function clear() {
    setSearchInput("");
    setQuery(initialQuery);
  }
  function filter(change: Partial<EventsQuery>) {
    setQuery((previous) => ({ ...previous, ...change, page: 0 }));
  }
  return (
    <>
      <PageHeader
        title="Event Explorer"
        description="Follow an event from observation to processing reports and business evidence."
      />
      <section className="panel events-panel" aria-labelledby="events-title">
        <div className="panel-header">
          <h2 id="events-title">Observed events</h2>
          <span className="eyebrow">Demo data</span>
        </div>
        <p className="list-summary">Newest first · occurredAt DESC</p>
        <div className="filter-bar">
          <label className="search-field">
            Logical event ID
            <input
              type="search"
              maxLength={128}
              placeholder="Search event ID…"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                filter({ search: event.target.value.trim() });
              }}
            />
          </label>
          <label>
            Application
            <select
              aria-label="Application"
              value={query.applicationId}
              disabled={applications.phase !== "success"}
              onChange={(event) =>
                filter({ applicationId: event.target.value })
              }
            >
              <option value="">
                {applications.phase === "loading"
                  ? "Loading applications…"
                  : applications.phase === "error"
                    ? "Applications unavailable"
                    : "All applications"}
              </option>
              {applications.phase === "success" &&
                applications.data.map((application) => (
                  <option key={application.id} value={application.id}>
                    {application.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Processing status
            <select
              aria-label="Processing status"
              value={query.status}
              onChange={(event) => {
                const value =
                  statuses.find((status) => status === event.target.value) ??
                  "";
                filter({ status: value });
              }}
            >
              <option value="">All processing statuses</option>
              {statuses.map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-secondary"
            type="button"
            onClick={clear}
            disabled={!hasFilters && !searchInput}
          >
            Clear filters
          </button>
        </div>
        {applications.phase === "error" && (
          <ErrorState
            title="Could not load application filters"
            description={requestErrorMessage(applications.error)}
            onRetry={applications.retry}
          />
        )}
        <div aria-live="polite" aria-busy={resource.phase === "loading"}>
          {resource.phase === "loading" && (
            <div className="panel-body">
              <LoadingSkeleton variant="table" label="Loading events" />
            </div>
          )}
          {resource.phase === "error" && (
            <ErrorState
              title="Could not load events"
              description={requestErrorMessage(resource.error)}
              onRetry={resource.retry}
            />
          )}
          {data && (
            <>
              <DataTable
                caption="Observed events"
                columns={[
                  { id: "event", label: "Logical event ID / observed ID" },
                  { id: "app", label: "Application / type" },
                  { id: "time", label: "Occurred at · UTC" },
                  { id: "status", label: "Processing" },
                  { id: "attempts", label: "Reported attempts" },
                  { id: "outcomes", label: "Rule outcomes" },
                  { id: "incident", label: "Incident" },
                ]}
                emptyState={
                  <EmptyState
                    icon={Search}
                    title={
                      hasFilters ? "No matching events" : "No events recorded"
                    }
                    description={
                      hasFilters
                        ? "No records match these search and filter conditions."
                        : "The dataset loaded successfully and contains no event records."
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
                {data.items.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <Link
                        className="text-link"
                        to={`/events/${encodeURIComponent(event.id)}`}
                      >
                        {event.eventId}
                      </Link>
                      <small className="cell-description">
                        Observed ID: {event.id}
                      </small>
                    </td>
                    <td>
                      {event.applicationName}
                      <small className="cell-description">
                        {event.eventType ?? "Type not available"}
                      </small>
                    </td>
                    <td className="nowrap">{utcTime(event.occurredAt)}</td>
                    <td>
                      <StatusBadge
                        label={event.processingStatus}
                        tone={statusTone(event.processingStatus)}
                      />
                      {event.hasReportConflict && (
                        <small className="cell-description">
                          Report conflict
                        </small>
                      )}
                    </td>
                    <td>
                      {event.reportedAttemptCount}
                      {event.reportedAttemptCount === 0 && (
                        <small className="cell-description">
                          Actual total unknown
                        </small>
                      )}
                    </td>
                    <td>
                      <RuleOutcomes results={event.ruleResults} />
                    </td>
                    <td>
                      {event.relatedIncidentId ? (
                        <Link
                          className="text-link"
                          to={`/incidents/${encodeURIComponent(event.relatedIncidentId)}`}
                        >
                          {event.relatedIncidentId}
                        </Link>
                      ) : (
                        <span className="muted">No linked incident</span>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
              <p className="list-summary">
                {data.totalItems === 0
                  ? "Showing 0 of 0"
                  : `Showing ${data.page * data.size + 1}–${data.page * data.size + data.items.length} of ${data.totalItems}`}
              </p>
              <nav className="pagination" aria-label="Events pagination">
                <span role="status">
                  {data.totalItems} events ·{" "}
                  {data.totalPages === 0
                    ? "No pages"
                    : `Page ${data.page + 1} of ${data.totalPages}`}
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
                  {Array.from(
                    new Set([
                      0,
                      data.page - 1,
                      data.page,
                      data.page + 1,
                      data.totalPages - 1,
                    ]),
                  )
                    .filter((index) => index >= 0 && index < data.totalPages)
                    .sort((left, right) => left - right)
                    .map((index) => (
                      <button
                        key={index}
                        type="button"
                        className="button button-secondary"
                        aria-label={`Page ${index + 1}`}
                        aria-current={index === data.page ? "page" : undefined}
                        disabled={index === data.page}
                        onClick={() =>
                          setQuery((previous) => ({ ...previous, page: index }))
                        }
                      >
                        {index + 1}
                      </button>
                    ))}
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
        Multiple processing attempts do not necessarily mean multiple business
        effects. Reported counts do not establish the actual total. All times
        are UTC.
      </p>
    </>
  );
}
