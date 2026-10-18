import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { PlaceholderPanel } from "../components/ui/PlaceholderPanel";

export function IncidentDetailPage() {
  const { id } = useParams<"id">();
  return (
    <>
      <PageHeader
        title="Incident detail"
        description="Review the linked event, violation evidence and investigation history."
        backLink={
          <Link to="/incidents" className="back-link">
            <ArrowLeft size={15} aria-hidden="true" />
            Back to Incidents
          </Link>
        }
      />
      <div className="resource-reference">
        <span className="eyebrow">Requested incident ID</span>
        <code>{id}</code>
      </div>
      <PlaceholderPanel
        title="Incident investigation"
        description="This incident has not been loaded. Its existence cannot be verified until a data source is connected. Status changes are not available yet."
      />
    </>
  );
}
