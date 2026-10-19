import { useCallback } from "react";
import { ArrowLeft, ArrowUpRight, FileSearch } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { StatusBadge } from "../components/ui/StatusBadge";
import {
  AttemptTimeline,
  EvaluationList,
  EvidenceList,
} from "../components/monitoring/EventInvestigation";
import {
  isResourceNotFound,
  requestErrorMessage,
  statusTone,
  utcTime,
} from "../components/monitoring/presentation";
import { useApiResource } from "../hooks/useApiResource";
import { monitorApi, type MonitorApi } from "../services/index";

export function EventDetailPage({ api = monitorApi }: { api?: MonitorApi }) {
  const { id = "" } = useParams<"id">();
  const load = useCallback(
    (signal: AbortSignal) => api.getEventDetail(id, { signal }),
    [api, id],
  );
  const resource = useApiResource(load);
  const event = resource.phase === "success" ? resource.data : null;
  return (
    <>
      <PageHeader
        title="Event detail"
        description="Inspect metadata, reported attempts, evaluations and evidence for one observed event."
        backLink={
          <Link to="/events" className="back-link">
            <ArrowLeft size={15} aria-hidden="true" />
            Back to Events
          </Link>
        }
      />
      {resource.phase === "loading" && (
        <LoadingSkeleton variant="detail" label="Loading event detail" />
      )}
      {resource.phase === "error" &&
        (isResourceNotFound(resource.error) ? (
          <EmptyState
            title="Event Not Found"
            description={`No observed event exists for ID ${id}.`}
            icon={FileSearch}
            action={
              <Link className="button button-secondary" to="/events">
                Return to Events
              </Link>
            }
          />
        ) : (
          <ErrorState
            title="Could not load event detail"
            description={requestErrorMessage(resource.error)}
            onRetry={resource.retry}
          />
        ))}
      {event && (
        <>
          <section className="panel" aria-labelledby="metadata-title">
            <div className="panel-header">
              <div>
                <h2 id="metadata-title">{event.eventId}</h2>
                <p className="muted">{event.applicationName} · Demo data</p>
              </div>
              <StatusBadge
                label={event.processingStatus}
                tone={statusTone(event.processingStatus)}
              />
            </div>
            <div className="panel-body">
              <p className="processing-reason">
                {event.processingStatusReason}
              </p>
              <dl className="metadata-grid">
                <div>
                  <dt>Observed ID</dt>
                  <dd>{event.id}</dd>
                </div>
                <div>
                  <dt>Logical event ID</dt>
                  <dd>{event.eventId}</dd>
                </div>
                <div>
                  <dt>Application</dt>
                  <dd>
                    {event.applicationName} ({event.applicationId})
                  </dd>
                </div>
                <div>
                  <dt>Event type</dt>
                  <dd>{event.eventType ?? "Not available"}</dd>
                </div>
                <div>
                  <dt>Correlation ID</dt>
                  <dd>{event.correlationId ?? "Not available"}</dd>
                </div>
                <div>
                  <dt>Customer reference</dt>
                  <dd>{event.customerRef ?? "Not established"}</dd>
                </div>
                <div>
                  <dt>Occurred at</dt>
                  <dd>{utcTime(event.occurredAt)}</dd>
                </div>
                <div>
                  <dt>First seen at</dt>
                  <dd>{utcTime(event.firstSeenAt)}</dd>
                </div>
                <div>
                  <dt>Observation status</dt>
                  <dd>
                    <StatusBadge label={event.observationStatus} />
                  </dd>
                </div>
                <div>
                  <dt>Processing status</dt>
                  <dd>
                    <StatusBadge
                      label={event.processingStatus}
                      tone={statusTone(event.processingStatus)}
                    />
                  </dd>
                </div>
                <div>
                  <dt>Reported attempt count</dt>
                  <dd>
                    {event.reportedAttemptCount}
                    {event.reportedAttemptCount === 0 &&
                      " · actual total unknown"}
                  </dd>
                </div>
                <div>
                  <dt>Evaluation state</dt>
                  <dd>{event.evaluationState}</dd>
                </div>
                <div>
                  <dt>Expected points</dt>
                  <dd>{event.expectedPoints ?? "Not established"}</dd>
                </div>
                <div>
                  <dt>Evidence source key</dt>
                  <dd>{event.evidenceSourceKey ?? "Not available"}</dd>
                </div>
                <div>
                  <dt>Evaluation generation</dt>
                  <dd>{event.evaluationGeneration}</dd>
                </div>
                <div>
                  <dt>Evaluated generation</dt>
                  <dd>{event.evaluatedGeneration}</dd>
                </div>
              </dl>
              <nav className="detail-navigation" aria-label="Event sections">
                <a className="button button-secondary" href="#attempts">
                  Attempts
                </a>
                <a className="button button-secondary" href="#evaluations">
                  Evaluations
                </a>
                <a className="button button-primary" href="#evidence">
                  View evidence
                </a>
                {event.relatedIncidentId && (
                  <Link
                    className="button button-secondary"
                    to={`/incidents/${encodeURIComponent(event.relatedIncidentId)}`}
                  >
                    Incident {event.relatedIncidentId}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                )}
              </nav>
              {!event.relatedIncidentId && (
                <p className="context-note">
                  No linked incident. UNKNOWN alone does not establish a
                  business violation.
                </p>
              )}
            </div>
          </section>
          <AttemptTimeline event={event} />
          <EvaluationList evaluations={event.evaluations} />
          <EvidenceList evidence={event.evidence} />
        </>
      )}
    </>
  );
}
