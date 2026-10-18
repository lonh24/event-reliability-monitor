import {
  Activity,
  ArrowRight,
  CircleCheck,
  CircleHelp,
  ShieldAlert,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { PlaceholderPanel } from "../components/ui/PlaceholderPanel";

export function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="A clear view of event processing, business evidence and incidents."
        action={
          <Link className="button button-secondary" to="/events">
            Explore events
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        }
      />
      <div className="prototype-notice">
        <span className="notice-dot" aria-hidden="true" />
        <p>
          <strong>Your workspace is ready to explore.</strong> Data integration
          is pending. Metrics are unavailable.
        </p>
      </div>
      <div className="stat-grid">
        <StatCard
          label="Observed events"
          value={null}
          description="Events recorded by the monitor"
          icon={Activity}
        />
        <StatCard
          label="Confirmed processing"
          value={null}
          description="Confirmed processing signals"
          icon={CircleCheck}
        />
        <StatCard
          label="Open incidents"
          value={null}
          description="Open or under investigation"
          icon={ShieldAlert}
        />
        <StatCard
          label="Unknown evaluations"
          value={null}
          description="Rules with insufficient evidence"
          icon={CircleHelp}
        />
      </div>
      <PlaceholderPanel
        title="Event volume"
        description="Event volume by UTC time bucket will appear when the demo data source is connected."
      />
      <PlaceholderPanel
        title="Latest incidents"
        description="Incident summaries and investigation links will appear here after data integration."
        columns={[
          { id: "incident", label: "Incident" },
          { id: "application", label: "Application" },
          { id: "severity", label: "Severity" },
          { id: "status", label: "Status" },
          { id: "openedAt", label: "Opened at · UTC" },
        ]}
      />
      <p className="context-note">
        Processing confirmation and business correctness are separate. Rule
        outcomes depend on the available evidence.
      </p>
    </>
  );
}
