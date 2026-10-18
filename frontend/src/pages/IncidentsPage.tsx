import { PageHeader } from "../components/ui/PageHeader";
import { PlaceholderPanel } from "../components/ui/PlaceholderPanel";

export function IncidentsPage() {
  return (
    <>
      <PageHeader
        title="Incidents"
        description="Investigate evidence-backed violations and track each case through resolution."
      />
      <PlaceholderPanel
        title="Investigation queue"
        description="Incident records will appear after data integration. Filters and status changes are not available yet."
        columns={[
          { id: "summary", label: "Incident" },
          { id: "application", label: "Application" },
          { id: "severity", label: "Severity" },
          { id: "status", label: "Status" },
          { id: "openedAt", label: "Opened at · UTC" },
        ]}
      />
      <p className="context-note">
        Resolving a case changes its investigation status. It does not repair
        business data.
      </p>
    </>
  );
}
