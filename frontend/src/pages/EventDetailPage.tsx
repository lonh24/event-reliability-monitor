import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { PlaceholderPanel } from "../components/ui/PlaceholderPanel";

export function EventDetailPage() {
  const { id } = useParams<"id">();
  return (
    <>
      <PageHeader
        title="Event detail"
        description="Inspect metadata, reported attempts, evaluations and evidence for one observed event."
        backLink={
          <Link to="/events" className="back-link">
            <ArrowLeft size={15} aria-hidden="true" />
            Back to Events
          </Link>
        }
      />
      <div className="resource-reference">
        <span className="eyebrow">Requested observation ID</span>
        <code>{id}</code>
      </div>
      <PlaceholderPanel
        title="Event investigation"
        description="This event has not been loaded. Its existence cannot be verified until a data source is connected; no attempts or business effects have been inferred."
      />
    </>
  );
}
