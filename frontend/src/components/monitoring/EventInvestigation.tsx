import { Link } from "react-router-dom";
import { Activity, FileSearch } from "lucide-react";
import type {
  EventDetailResponse,
  EvidenceResponse,
  RuleEvaluationResponse,
} from "../../types/api";
import { DataTable } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { StatusBadge } from "../ui/StatusBadge";
import { statusTone, utcTime } from "./presentation";

export function AttemptTimeline({ event }: { event: EventDetailResponse }) {
  return (
    <section className="panel" id="attempts" aria-labelledby="attempts-title">
      <div className="panel-header">
        <h2 id="attempts-title">Reported processing attempts</h2>
        <span className="eyebrow">{event.reportedAttemptCount} reported</span>
      </div>
      <div className="panel-body">
        {event.hasReportConflict && (
          <p className="investigation-warning">
            Report conflict: contradictory claims are preserved. Processing
            success is not established by choosing one report.
          </p>
        )}
        {!event.attempts.length && (
          <EmptyState
            title="No processing reports available"
            description="No attempts have been reported. The actual total number of processing attempts is unknown; ledger evidence does not reconstruct a processing timeline."
            icon={Activity}
          />
        )}
        <ol className="attempt-timeline">
          {event.attempts.map((attempt) => (
            <li className="attempt-item" key={attempt.id}>
              <div className="record-heading">
                <h3>Attempt {attempt.attemptNo ?? "number not available"}</h3>
                <StatusBadge
                  label={attempt.status}
                  tone={statusTone(attempt.status)}
                />
              </div>
              <p className="mono muted">
                {attempt.id} · Producer: {attempt.producerAttemptId}
              </p>
              <p className="record-times">
                Started: {utcTime(attempt.startedAt)}
                <br />
                Finished: {utcTime(attempt.finishedAt)}
              </p>
              {attempt.hasTerminalConflict && (
                <p className="investigation-warning">
                  Conflicting terminal reports · completion time is not
                  established.
                </p>
              )}
              <ul className="report-list">
                {event.reports
                  .filter((report) => report.attemptId === attempt.id)
                  .map((report) => (
                    <li key={report.id} id={`report-${report.id}`}>
                      <div className="record-heading">
                        <h4>{report.id}</h4>
                        <StatusBadge
                          label={report.reportedStatus}
                          tone={statusTone(report.reportedStatus)}
                        />
                      </div>
                      <dl className="metadata-grid compact-grid">
                        <div>
                          <dt>Producer report ID</dt>
                          <dd>{report.producerReportId}</dd>
                        </div>
                        <div>
                          <dt>Started</dt>
                          <dd>{utcTime(report.startedAt)}</dd>
                        </div>
                        <div>
                          <dt>Finished</dt>
                          <dd>{utcTime(report.finishedAt)}</dd>
                        </div>
                        <div>
                          <dt>Reported</dt>
                          <dd>{utcTime(report.reportedAt)}</dd>
                        </div>
                        <div>
                          <dt>Received</dt>
                          <dd>{utcTime(report.receivedAt)}</dd>
                        </div>
                        <div>
                          <dt>Error code</dt>
                          <dd>{report.errorCode ?? "None reported"}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function EvaluationRecord({
  evaluation,
  context = "event",
}: {
  evaluation: RuleEvaluationResponse;
  context?: "event" | "incident";
}) {
  return (
    <article
      className="evaluation-record"
      aria-label={`${evaluation.ruleType} ${evaluation.isLatest ? "latest" : "historical"} evaluation`}
    >
      <div className="record-heading">
        <div>
          <h3>{evaluation.ruleType}</h3>
          <p className="mono muted">
            {evaluation.ruleId} · {evaluation.id}
          </p>
        </div>
        <StatusBadge
          label={evaluation.outcome}
          tone={statusTone(evaluation.outcome)}
        />
      </div>
      <p>{evaluation.reason}</p>
      <p className="reason-code">{evaluation.reasonCode}</p>
      <p className="record-times">
        Evaluated: {utcTime(evaluation.evaluatedAt)} · Rule version{" "}
        {evaluation.ruleVersion} · Input generation {evaluation.inputGeneration}
      </p>
      <p className="context-note">
        {context === "incident"
          ? `Linked case evaluation · ${evaluation.isLatest ? "also latest for this event" : "historical event assessment"}`
          : evaluation.isLatest
            ? "Latest evaluation"
            : "Historical evaluation · does not replace the latest result"}
      </p>
      <ul className="evidence-links" aria-label="Evidence references">
        {evaluation.evidenceIds.map((id) => (
          <li key={id}>
            <a
              className="text-link"
              href={`#evidence-${encodeURIComponent(id)}`}
            >
              {id}
            </a>
          </li>
        ))}
      </ul>
      {!evaluation.evidenceIds.length && (
        <p className="muted">No evidence references available.</p>
      )}
    </article>
  );
}

export function EvaluationList({
  evaluations,
}: {
  evaluations: RuleEvaluationResponse[];
}) {
  const latest = evaluations.filter((evaluation) => evaluation.isLatest);
  const historical = evaluations.filter((evaluation) => !evaluation.isLatest);
  return (
    <section
      className="panel"
      id="evaluations"
      aria-labelledby="evaluations-title"
    >
      <div className="panel-header">
        <h2 id="evaluations-title">Rule evaluations</h2>
        <span className="eyebrow">Evidence-based outcomes</span>
      </div>
      <div className="panel-body">
        <p className="context-note">
          Processing CONFIRMED does not prove business correctness. UNKNOWN
          means evidence is insufficient for that rule.
        </p>
        {!latest.length && (
          <EmptyState
            title="No latest evaluations available"
            description="No current rule result was returned. This is not a PASS or a violation."
            icon={FileSearch}
          />
        )}
        <div className="evaluation-grid">
          {latest.map((evaluation) => (
            <EvaluationRecord key={evaluation.id} evaluation={evaluation} />
          ))}
        </div>
        {historical.length > 0 && (
          <div className="history-evaluations">
            <h3>Historical evaluations</h3>
            <div className="evaluation-grid">
              {historical.map((evaluation) => (
                <EvaluationRecord key={evaluation.id} evaluation={evaluation} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function EvidenceRecord({
  evidence,
  reportLinksToEvent = false,
}: {
  evidence: EvidenceResponse;
  reportLinksToEvent?: boolean;
}) {
  return (
    <article
      className="evidence-record"
      id={`evidence-${evidence.id}`}
      aria-label={`Evidence ${evidence.id}`}
      tabIndex={-1}
    >
      <div className="record-heading">
        <div>
          <h3>{evidence.id}</h3>
          <p className="source-label">{evidence.sourceLabel}</p>
        </div>
        <span className="eyebrow">{evidence.kind}</span>
      </div>
      <dl className="metadata-grid compact-grid">
        <div>
          <dt>Source key</dt>
          <dd>{evidence.sourceKey}</dd>
        </div>
        <div>
          <dt>Logical event scope</dt>
          <dd>{evidence.scope.eventId}</dd>
        </div>
        <div>
          <dt>Customer reference</dt>
          <dd>{evidence.scope.customerRef ?? "Not established"}</dd>
        </div>
        <div>
          <dt>Sandbox run</dt>
          <dd>{evidence.scope.runId ?? "Not applicable / unavailable"}</dd>
        </div>
        <div>
          <dt>Coverage</dt>
          <dd>
            <StatusBadge
              label={evidence.coverage}
              tone={statusTone(evidence.coverage)}
            />
          </dd>
        </div>
        <div>
          <dt>Trust</dt>
          <dd>
            <StatusBadge
              label={evidence.trust}
              tone={statusTone(evidence.trust)}
            />
          </dd>
        </div>
        <div>
          <dt>Finality</dt>
          <dd>
            <StatusBadge
              label={evidence.finality}
              tone={statusTone(evidence.finality)}
            />
          </dd>
        </div>
        <div>
          <dt>Snapshot at</dt>
          <dd>{utcTime(evidence.snapshotAt)}</dd>
        </div>
        <div>
          <dt>Collected at</dt>
          <dd>{utcTime(evidence.collectedAt)}</dd>
        </div>
        <div>
          <dt>Supersedes</dt>
          <dd>
            {evidence.supersedesEvidenceId ?? "No earlier evidence referenced"}
          </dd>
        </div>
      </dl>
      {evidence.ledger ? (
        <div className="ledger-snapshot">
          <h4>Ledger snapshot · read only</h4>
          <dl className="metadata-grid compact-grid">
            <div>
              <dt>Expected points</dt>
              <dd>{evidence.ledger.expectedPoints ?? "Not established"}</dd>
            </div>
            <div>
              <dt>Effect count</dt>
              <dd>{evidence.ledger.effectCount ?? "Not established"}</dd>
            </div>
            <div>
              <dt>Total delta</dt>
              <dd>{evidence.ledger.totalDelta ?? "Not established"}</dd>
            </div>
          </dl>
          <DataTable
            caption={`Visible business effects in ${evidence.id}`}
            columns={[
              { id: "id", label: "Effect ID" },
              { id: "event", label: "Logical event ID" },
              { id: "customer", label: "Customer reference" },
              { id: "delta", label: "Delta" },
              { id: "created", label: "Created at · UTC" },
            ]}
            emptyState={
              <p className="context-note">
                No individual effects supplied. This list alone does not
                establish an exact effect count.
              </p>
            }
          >
            {evidence.ledger.effects.map((effect) => (
              <tr key={effect.id}>
                <td>{effect.id}</td>
                <td>{effect.eventId}</td>
                <td>{effect.customerRef}</td>
                <td>+{effect.delta}</td>
                <td>{utcTime(effect.createdAt)}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : (
        <p className="context-note">
          No ledger snapshot supplied by this evidence. Effect count and total
          delta are not established here.
        </p>
      )}
      {evidence.reportIds.length > 0 && (
        <p className="context-note">
          Report references:{" "}
          {evidence.reportIds.map((id) =>
            reportLinksToEvent ? (
              <Link
                key={id}
                className="text-link inline-reference"
                to={`/events/${encodeURIComponent(evidence.observedEventId)}`}
              >
                {id} (event detail)
              </Link>
            ) : (
              <a
                key={id}
                className="text-link inline-reference"
                href={`#report-${encodeURIComponent(id)}`}
              >
                {id}
              </a>
            ),
          )}
          . Report coverage is not proof that all actual attempts are known.
        </p>
      )}
      {evidence.gaps.length > 0 && (
        <div className="evidence-gaps">
          <h4>Evidence gaps</h4>
          <ul>
            {evidence.gaps.map((gap, index) => (
              <li key={`${gap.code}-${index}`}>
                <strong>{gap.code}</strong>: {gap.message}
                {gap.missingFields.length > 0 && (
                  <p>Missing fields: {gap.missingFields.join(", ")}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function EvidenceList({
  evidence,
  reportLinksToEvent = false,
}: {
  evidence: EvidenceResponse[];
  reportLinksToEvent?: boolean;
}) {
  return (
    <section className="panel" id="evidence" aria-labelledby="evidence-title">
      <div className="panel-header">
        <h2 id="evidence-title">Business evidence</h2>
        <span className="eyebrow">Read only · masked references</span>
      </div>
      <div className="panel-body">
        <p className="context-note">
          Evidence is scoped to its source and snapshot. Snapshot time does not
          establish consumer completion time.
        </p>
        {evidence.length ? (
          evidence.map((record) => (
            <EvidenceRecord
              key={record.id}
              evidence={record}
              reportLinksToEvent={reportLinksToEvent}
            />
          ))
        ) : (
          <EmptyState
            title="No evidence available"
            description="No evidence records were returned. Business effects are not established; this does not mean zero effects."
            icon={FileSearch}
          />
        )}
      </div>
    </section>
  );
}
