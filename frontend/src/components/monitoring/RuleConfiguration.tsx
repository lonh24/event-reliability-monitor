import type { MonitoringRuleResponse } from "../../types/api";
export function RuleConfiguration({ rule }: { rule: MonitoringRuleResponse }) {
  switch (rule.ruleType) {
    case "TIMEOUT":
      return (
        <>
          <dl className="rule-config">
            <dt>thresholdSeconds</dt>
            <dd>{rule.config.thresholdSeconds}</dd>
            <dt>completionBasis</dt>
            <dd>{rule.config.completionBasis}</dd>
          </dl>
          <p className="cell-description">
            Measures completion using the first trusted success. Missing trusted
            completion evidence remains UNKNOWN; elapsed time alone does not
            establish a violation.
          </p>
        </>
      );
    case "DUPLICATE_BUSINESS_EFFECT":
      return (
        <>
          <dl className="rule-config">
            <dt>maxEffects</dt>
            <dd>{rule.config.maxEffects}</dd>
            <dt>sourcePolicy</dt>
            <dd>{rule.config.sourcePolicy}</dd>
          </dl>
          <p className="cell-description">
            Checks effect count in the event-bound business evidence source.
            Multiple attempts alone do not prove duplicate business effects.
          </p>
        </>
      );
    case "DATA_INVARIANT":
      return (
        <>
          <dl className="rule-config">
            <dt>expectedSource</dt>
            <dd>{rule.config.expectedSource}</dd>
            <dt>comparison</dt>
            <dd>{rule.config.comparison}</dd>
          </dl>
          <p className="cell-description">
            Compares total ledger delta with the order expectation. Incomplete
            evidence preserves UNKNOWN instead of assuming zero effects.
          </p>
        </>
      );
  }
}
