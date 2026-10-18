import { PageHeader } from "../components/ui/PageHeader";
import { PlaceholderPanel } from "../components/ui/PlaceholderPanel";

export function ApplicationsPage() {
  return (
    <>
      <PageHeader
        title="Applications"
        description="Manage the application context for the events you investigate."
      />
      <PlaceholderPanel
        title="Application directory"
        description="Application configurations will appear here after data integration. Creating an application is not available yet."
        columns={[
          { id: "name", label: "Application" },
          { id: "environment", label: "Environment" },
          { id: "status", label: "Status" },
        ]}
      />
      <p className="context-note">
        Application configuration does not connect a live service or create
        events.
      </p>
    </>
  );
}
