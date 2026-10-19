import { lazy, Suspense, useCallback } from "react";
import {
  Activity,
  ArrowRight,
  CircleCheck,
  CircleHelp,
  ShieldAlert,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { DataTable } from "../components/ui/DataTable";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { StatusBadge } from "../components/ui/StatusBadge";
import {
  statusTone,
  utcTime,
  requestErrorMessage,
} from "../components/monitoring/presentation";
import { useApiResource } from "../hooks/useApiResource";
import { monitorApi, type MonitorApi } from "../services/index";

const EventVolumeChart = lazy(
  () => import("../components/monitoring/EventVolumeChart"),
);

export function OverviewPage({ api = monitorApi }: { api?: MonitorApi }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      api.getOverview({ range: "24h", bucket: "hour" }, { signal }),
    [api],
  );
  const resource = useApiResource(load);
  const data = resource.phase === "success" ? resource.data : null;
  return (
    <>
      <PageHeader
        title="Overview"
        description="A clear view of event processing, business evidence and incidents."
        action={
          <Link className="button button-secondary" to="/events">
            Explore events <ArrowRight size={16} aria-hidden="true" />
          </Link>
        }
      />
      <div className="prototype-notice">
        <span className="notice-dot" aria-hidden="true" />
        <p>
          <strong>Demo data · 24-hour snapshot.</strong>{" "}
          {data
            ? `As of ${utcTime(data.asOf)}. Changes reset on reload.`
            : "Reference snapshot only. No live monitoring."}
        </p>
      </div>
      <div className="stat-grid" aria-busy={resource.phase === "loading"}>
        <StatCard
          label="Observed events"
          value={data?.stats.observedEvents ?? null}
          description="Observed within this snapshot window"
          icon={Activity}
          loading={resource.phase === "loading"}
        />
        <StatCard
          label="Confirmed processing"
          value={data?.stats.confirmedProcessing ?? null}
          description="Processing signals, not business correctness"
          icon={CircleCheck}
          tone="success"
          loading={resource.phase === "loading"}
        />
        <StatCard
          label="Open incidents"
          value={data?.stats.openIncidents ?? null}
          description="Open or under investigation"
          icon={ShieldAlert}
          tone="danger"
          loading={resource.phase === "loading"}
        />
        <StatCard
          label="Unknown evaluations"
          value={data?.stats.unknownEvaluations ?? null}
          description="Rules with insufficient evidence · not events"
          icon={CircleHelp}
          loading={resource.phase === "loading"}
        />
      </div>
      {resource.phase === "error" && (
        <ErrorState
          title="Could not load Overview"
          description={requestErrorMessage(resource.error)}
          onRetry={resource.retry}
        />
      )}
      {resource.phase === "loading" && (
        <LoadingSkeleton
          variant="table"
          label="Loading Overview chart and incidents"
        />
      )}
      {data && (
        <>
          <section className="panel" aria-labelledby="volume-title">
            <div className="panel-header">
              <div>
                <h2 id="volume-title">Event volume</h2>
                <p className="muted">
                  Hourly buckets · UTC · partial edge buckets included
                </p>
              </div>
              <span className="eyebrow">Last 24 hours</span>
            </div>
            <div className="panel-body">
              <p className="context-note">
                Window: {utcTime(data.windowStart)} → {utcTime(data.windowEnd)}{" "}
                (exclusive).
              </p>
              {data.stats.observedEvents === 0 ? (
                <EmptyState
                  title="No observed events in this window"
                  description="The snapshot loaded successfully. No observed records fall within this window."
                  icon={Activity}
                />
              ) : (
                <div
                  className="volume-chart"
                  role="group"
                  aria-label="Observed event volume by UTC hour"
                >
                  <Suspense
                    fallback={
                      <LoadingSkeleton label="Loading event volume chart" />
                    }
                  >
                    <EventVolumeChart buckets={data.volumeBuckets} />
                  </Suspense>
                </div>
              )}
              <details className="chart-data">
                <summary>View exact UTC bucket counts</summary>
                <DataTable
                  caption="Event volume buckets"
                  columns={[
                    { id: "start", label: "Start · UTC" },
                    { id: "end", label: "End · UTC" },
                    { id: "count", label: "Observed events" },
                    { id: "partial", label: "Window coverage" },
                  ]}
                  emptyState={<p>No volume buckets returned.</p>}
                >
                  {data.volumeBuckets.map((bucket) => (
                    <tr key={bucket.startAt}>
                      <td>{utcTime(bucket.startAt)}</td>
                      <td>{utcTime(bucket.endAt)}</td>
                      <td>{bucket.count}</td>
                      <td>{bucket.partial ? "Partial" : "Full"}</td>
                    </tr>
                  ))}
                </DataTable>
              </details>
            </div>
          </section>
          <section className="panel" aria-labelledby="latest-title">
            <div className="panel-header">
              <h2 id="latest-title">Latest incidents</h2>
              <Link className="text-link" to="/incidents">
                View incidents <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <DataTable
              caption="Latest incidents"
              columns={[
                { id: "incident", label: "Incident" },
                { id: "app", label: "Application" },
                { id: "severity", label: "Severity" },
                { id: "status", label: "Status" },
                { id: "time", label: "Opened at · UTC" },
              ]}
              emptyState={
                <EmptyState
                  title="No incidents in this window"
                  description="No incident records were returned for this snapshot."
                  icon={ShieldAlert}
                />
              }
            >
              {data.latestIncidents.map((incident) => (
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
                  <td>{incident.applicationName}</td>
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
                </tr>
              ))}
            </DataTable>
          </section>
        </>
      )}
      <p className="context-note">
        Processing confirmation and business correctness are separate. Rule
        outcomes depend on the available evidence.
      </p>
    </>
  );
}
