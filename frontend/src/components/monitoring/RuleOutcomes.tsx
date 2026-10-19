import type { RuleResultSummaryResponse } from "../../types/api.ts";
import { StatusBadge } from "../ui/StatusBadge.tsx";
import { statusTone } from "./presentation.ts";

export function RuleOutcomes({
  results,
}: {
  results: RuleResultSummaryResponse[];
}) {
  if (!results.length)
    return <span className="muted">No evaluations available</span>;
  return (
    <ul className="outcome-list">
      {results.map((result) => (
        <li key={result.evaluationId}>
          <span title={result.ruleId}>{result.ruleType}</span>
          <StatusBadge
            label={result.outcome}
            tone={statusTone(result.outcome)}
          />
        </li>
      ))}
    </ul>
  );
}
