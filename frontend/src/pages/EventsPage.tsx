import { PageHeader } from "../components/ui/PageHeader";
import { PlaceholderPanel } from "../components/ui/PlaceholderPanel";

export function EventsPage() {
  return (
    <>
      <PageHeader
        title="Event Explorer"
        description="Follow an event from observation to processing reports and business evidence."
      />
      <PlaceholderPanel
        title="Observed events"
        description="Events will appear here after data integration. Search, filters and pagination are not available yet."
        columns={[
          { id: "eventId", label: "Logical event ID" },
          { id: "application", label: "Application" },
          { id: "processing", label: "Processing" },
          { id: "evaluations", label: "Rule outcomes" },
          { id: "occurredAt", label: "Occurred at · UTC" },
        ]}
      />
      <p className="context-note">
        Multiple processing attempts do not necessarily mean multiple business
        effects.
      </p>
    </>
  );
}
