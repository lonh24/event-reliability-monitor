import { PageHeader } from "../components/ui/PageHeader";
import { PlaceholderPanel } from "../components/ui/PlaceholderPanel";

export function RulesPage() {
  return (
    <>
      <PageHeader
        title="Monitoring Rules"
        description="Understand the conditions used to evaluate event reliability."
      />
      <PlaceholderPanel
        title="Rule configurations"
        description="Supported rule configurations will appear after data integration. Rule toggles are not available yet."
        columns={[
          { id: "name", label: "Rule" },
          { id: "application", label: "Application" },
          { id: "type", label: "Rule type" },
          { id: "enabled", label: "Enabled" },
        ]}
      />
      <p className="context-note">
        Changing a rule configuration will not rewrite historical evaluations or
        resolve incidents.
      </p>
    </>
  );
}
