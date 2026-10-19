import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, FileSearch, History } from "lucide-react";
import { Link } from "react-router-dom";
import type { IncidentDetailResponse } from "../../types/api";
import type { MonitorApi } from "../../services/monitorApi";
import { DataTable } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { StatusBadge } from "../ui/StatusBadge";
import { EvidenceList, EvaluationRecord } from "./EventInvestigation";
import { RuleOutcomes } from "./RuleOutcomes";
import {
  incidentMutationFailure,
  incidentTransitionRequest,
  nextIncidentStatus,
} from "./incidentWorkflow";
import { statusTone, utcTime } from "./presentation";

type MutationFailure = ReturnType<typeof incidentMutationFailure>;

export function IncidentInvestigation({
  initial,
  api,
  onReload,
}: {
  initial: IncidentDetailResponse;
  api: MonitorApi;
  onReload: () => void;
}) {
  const [incident, setIncident] = useState(initial);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<MutationFailure | null>(null);
  const [success, setSuccess] = useState("");
  const [noteError, setNoteError] = useState("");
  const submitting = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const nextStatus = nextIncidentStatus(incident.status);

  async function transition() {
    if (submitting.current || failure || nextStatus === null) return;
    let body;
    try {
      body = incidentTransitionRequest(incident, note);
    } catch {
      setNoteError("Investigation note must contain at most 500 characters.");
      return;
    }
    submitting.current = true;
    setPending(true);
    setSuccess("");
    setNoteError("");
    try {
      // Preserve the version string. Only the API owns status/version/history updates.
      // Do not abort/retry a PATCH when navigation makes its outcome uncertain.
      const updated = await api.updateIncidentStatus(incident.id, body);
      if (active.current) {
        setIncident(updated);
        setNote("");
        setSuccess(
          `Incident saved as ${updated.status} · revision ${updated.version}.`,
        );
      }
    } catch (error: unknown) {
      if (active.current) setFailure(incidentMutationFailure(error));
    } finally {
      submitting.current = false;
      if (active.current) setPending(false);
    }
  }

  return (
    <>
      <section className="panel" aria-labelledby="incident-title">
        <div className="panel-header">
          <div>
            <h2 id="incident-title">{incident.id}</h2>
            <p className="muted">{incident.applicationName} · Demo data</p>
          </div>
          <div className="incident-badges">
            <StatusBadge
              label={incident.severity}
              tone={statusTone(incident.severity)}
            />
            <StatusBadge
              label={incident.status}
              tone={statusTone(incident.status)}
            />
          </div>
        </div>
        <div className="panel-body">
          <h3 className="incident-summary">{incident.summary}</h3>
          <p className="incident-explanation">{incident.explanation}</p>
          <dl className="metadata-grid">
            <div>
              <dt>Application</dt>
              <dd>
                {incident.applicationName} ({incident.applicationId})
              </dd>
            </div>
            <div>
              <dt>Primary rule</dt>
              <dd>
                {incident.primaryRule.name}
                <small className="cell-description">
                  {incident.primaryRule.id} · {incident.primaryRule.ruleType}
                </small>
              </dd>
            </div>
            <div>
              <dt>Incident revision</dt>
              <dd data-testid="incident-version">{incident.version}</dd>
            </div>
            <div>
              <dt>Opened at</dt>
              <dd>{utcTime(incident.openedAt)}</dd>
            </div>
            <div>
              <dt>Updated at</dt>
              <dd>{utcTime(incident.updatedAt)}</dd>
            </div>
            <div>
              <dt>Resolved at</dt>
              <dd>
                {incident.resolvedAt === null
                  ? "Not resolved"
                  : utcTime(incident.resolvedAt)}
              </dd>
            </div>
          </dl>
          <p className="investigation-warning">
            RESOLVED updates the investigation record only. Business effects,
            ledger snapshots and historical violations remain unchanged. Demo
            changes reset on reload.
          </p>
          <nav className="detail-navigation" aria-label="Incident sections">
            <a className="button button-secondary" href="#case-evaluations">
              Linked evaluations
            </a>
            <a className="button button-primary" href="#evidence">
              View evidence
            </a>
            <a className="button button-secondary" href="#incident-history">
              History
            </a>
          </nav>
        </div>
      </section>
      <section className="panel" aria-labelledby="workflow-title">
        <div className="panel-header">
          <h2 id="workflow-title">Investigation workflow</h2>
          <span className="eyebrow">OPEN → INVESTIGATING → RESOLVED</span>
        </div>
        <div className="panel-body">
          {success && (
            <p className="mutation-success" role="status">
              {success}
            </p>
          )}
          {failure && (
            <div className="mutation-error" role="alert">
              <h3>{failure.title}</h3>
              <p>{failure.message}</p>
              <button
                type="button"
                className="button button-secondary"
                onClick={onReload}
              >
                Reload detail
              </button>
            </div>
          )}
          {nextStatus === null ? (
            <p className="context-note">
              This case is resolved and read only. Reopening is outside this
              workflow; resolving does not repair the underlying business data.
            </p>
          ) : (
            <form
              className="incident-transition-form"
              onSubmit={(event) => {
                event.preventDefault();
                void transition();
              }}
              aria-busy={pending}
            >
              <label htmlFor="investigation-note">
                Investigation note (optional)
              </label>
              <textarea
                id="investigation-note"
                rows={3}
                maxLength={500}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  setNoteError("");
                }}
                disabled={pending || failure !== null}
                aria-describedby="investigation-note-help"
                aria-invalid={noteError ? true : undefined}
              />
              <p id="investigation-note-help" className="context-note">
                Up to 500 characters. Saved with the successful status change.
              </p>
              {noteError && <p role="alert">{noteError}</p>}
              <button
                type="submit"
                className="button button-primary"
                disabled={pending || failure !== null}
              >
                {pending
                  ? "Saving change…"
                  : nextStatus === "INVESTIGATING"
                    ? "Start investigation"
                    : "Resolve incident"}
              </button>
              {pending && (
                <p className="context-note" role="status">
                  Saving incident change. Please wait.
                </p>
              )}
              <p className="context-note">
                Only the next permitted transition is offered. Reload detail
                after an error before deciding on another write.
              </p>
            </form>
          )}
        </div>
      </section>
      <section className="panel" aria-labelledby="linked-event-title">
        <div className="panel-header">
          <h2 id="linked-event-title">Linked event</h2>
          <Link
            className="text-link"
            to={`/events/${encodeURIComponent(incident.observedEventId)}`}
          >
            Open event {incident.observedEventId}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <div className="panel-body">
          <dl className="metadata-grid">
            <div>
              <dt>Observed ID</dt>
              <dd>{incident.linkedEvent.id}</dd>
            </div>
            <div>
              <dt>Logical event ID</dt>
              <dd>{incident.linkedEvent.eventId}</dd>
            </div>
            <div>
              <dt>Processing status</dt>
              <dd>
                <StatusBadge
                  label={incident.linkedEvent.processingStatus}
                  tone={statusTone(incident.linkedEvent.processingStatus)}
                />
              </dd>
            </div>
          </dl>
          <p className="context-note">
            {incident.linkedEvent.processingStatusReason}
          </p>
          <RuleOutcomes results={incident.linkedEvent.ruleResults} />
        </div>
      </section>
      <section
        className="panel"
        id="case-evaluations"
        aria-labelledby="case-evaluations-title"
      >
        <div className="panel-header">
          <h2 id="case-evaluations-title">Linked rule evaluations</h2>
          <span className="eyebrow">Persisted case evidence</span>
        </div>
        <div className="panel-body">
          <p className="context-note">
            These assessments are linked to this investigation. They remain part
            of the case after resolution, even when a newer event assessment
            exists.
          </p>
          {incident.linkedEvaluations.length ? (
            <div className="evaluation-grid">
              {incident.linkedEvaluations.map((evaluation) => (
                <EvaluationRecord
                  key={evaluation.id}
                  evaluation={evaluation}
                  context="incident"
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No linked evaluations available"
              description="The response contains no assessments linked to this case. No outcome has been inferred."
              icon={FileSearch}
            />
          )}
        </div>
      </section>
      <EvidenceList evidence={incident.evidence} reportLinksToEvent />
      <section
        className="panel"
        id="incident-history"
        aria-labelledby="history-title"
      >
        <div className="panel-header">
          <h2 id="history-title">Investigation history</h2>
          <History size={16} aria-hidden="true" />
        </div>
        <DataTable
          caption="Incident history"
          columns={[
            { id: "action", label: "Action / transition" },
            { id: "actor", label: "Actor" },
            { id: "note", label: "Note" },
            { id: "time", label: "Created at · UTC" },
          ]}
          emptyState={
            <EmptyState
              title="No history entries returned"
              description="History is supplied by the API; no entries are created by the UI."
              icon={History}
            />
          }
        >
          {incident.history.map((entry) => (
            <tr key={entry.id} data-history-id={entry.id}>
              <td>
                {entry.action}
                <small className="cell-description">
                  {entry.fromStatus ?? "Not applicable"} →{" "}
                  {entry.toStatus ?? "Not applicable"}
                </small>
              </td>
              <td>{entry.actorRef}</td>
              <td className="history-note">{entry.note || "No note"}</td>
              <td className="nowrap">{utcTime(entry.createdAt)}</td>
            </tr>
          ))}
        </DataTable>
      </section>
    </>
  );
}
