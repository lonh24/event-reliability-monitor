import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { MonitoringRuleResponse } from "../../types/api";
import type { MonitorApi } from "../../services/monitorApi";
import { StatusBadge } from "../ui/StatusBadge";
import { configurationFailure } from "./configurationWorkflow";
import { RuleConfiguration } from "./RuleConfiguration";
import { utcTime } from "./presentation";
export function RuleRow({
  initial,
  applicationName,
  api,
}: {
  initial: MonitoringRuleResponse;
  applicationName?: string;
  api: MonitorApi;
}) {
  const [rule, setRule] = useState(initial);
  const [pending, setPending] = useState(false),
    [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<ReturnType<
    typeof configurationFailure
  > | null>(null);
  const [feedback, setFeedback] = useState("");
  const lock = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function toggle() {
    if (lock.current || failure?.uncertain) return;
    lock.current = true;
    setPending(true);
    setFailure(null);
    setFeedback("");
    try {
      // Desired state only: configVersion is not an optimistic-locking revision.
      const updated = await api.updateRule(rule.id, { enabled: !rule.enabled });
      if (active.current) {
        setRule(updated);
        setFeedback(
          `Saved: ${updated.enabled ? "enabled" : "disabled"}. Historical evaluations are unchanged.`,
        );
      }
    } catch (error: unknown) {
      if (active.current) setFailure(configurationFailure(error));
    } finally {
      lock.current = false;
      if (active.current) setPending(false);
    }
  }
  async function reconcile() {
    if (lock.current) return;
    lock.current = true;
    setChecking(true);
    try {
      let page = 0;
      for (;;) {
        const result = await api.listRules({
          applicationId: rule.applicationId,
          page,
          size: 100,
          sort: "name,asc",
        });
        const found = result.items.find((item) => item.id === rule.id);
        if (found) {
          if (active.current) {
            setRule(found);
            setFailure(null);
            setFeedback(
              "Current rule reloaded. Review its enabled state before another change.",
            );
          }
          break;
        }
        if (++page >= result.totalPages)
          throw new Error("Rule no longer present");
      }
    } catch {
      if (active.current)
        setFeedback(
          "Could not confirm current state. Reload rules again before changing this rule.",
        );
    } finally {
      lock.current = false;
      if (active.current) setChecking(false);
    }
  }
  return (
    <tr data-rule-id={rule.id}>
      <td>
        <strong>{rule.name}</strong>
        <small className="cell-description mono">{rule.id}</small>
        <p className="cell-description">{rule.description}</p>
      </td>
      <td>
        {applicationName ?? rule.applicationId}
        {applicationName && (
          <small className="cell-description mono">{rule.applicationId}</small>
        )}
      </td>
      <td className="rule-configuration">
        <strong>{rule.ruleType}</strong>
        <RuleConfiguration rule={rule} />
      </td>
      <td className="rule-state">
        <StatusBadge
          label={rule.enabled ? "Enabled" : "Disabled"}
          tone={rule.enabled ? "success" : "disabled"}
        />
        <button
          className="button button-secondary"
          type="button"
          aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name} (${rule.id})`}
          disabled={pending || checking || Boolean(failure?.uncertain)}
          onClick={() => void toggle()}
        >
          {pending ? "Saving…" : rule.enabled ? "Disable" : "Enable"}
        </button>
        <div aria-live="polite">
          {feedback && <p className="cell-description">{feedback}</p>}
        </div>
        {failure && (
          <div className="mutation-error" role="alert">
            <h3>{failure.title}</h3>
            <p>{failure.message}</p>
            {failure.uncertain && (
              <button
                className="button button-secondary"
                type="button"
                disabled={checking}
                onClick={() => void reconcile()}
              >
                {checking ? "Reloading…" : "Reload rules"}
              </button>
            )}
          </div>
        )}
      </td>
      <td>
        <span>Config version {rule.configVersion}</span>
        <small className="cell-description nowrap">
          {utcTime(rule.updatedAt)}
        </small>
      </td>
      <td>
        <ul className="rule-links">
          {rule.relatedEventIds.map((id) => (
            <li key={`event-${id}`}>
              <Link
                className="text-link"
                to={`/events/${encodeURIComponent(id)}`}
              >
                {id}
              </Link>
            </li>
          ))}
          {rule.relatedIncidentIds.map((id) => (
            <li key={`incident-${id}`}>
              <Link
                className="text-link"
                to={`/incidents/${encodeURIComponent(id)}`}
              >
                {id}
              </Link>
            </li>
          ))}
        </ul>
        {rule.relatedEventIds.length + rule.relatedIncidentIds.length === 0 && (
          <span className="muted">No linked resources</span>
        )}
      </td>
    </tr>
  );
}
