import { useCallback } from "react";
import { ArrowLeft, FileSearch } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { IncidentInvestigation } from "../components/monitoring/IncidentInvestigation";
import {
  isResourceNotFound,
  requestErrorMessage,
} from "../components/monitoring/presentation";
import { useApiResource } from "../hooks/useApiResource";
import { monitorApi, type MonitorApi } from "../services/index";

export function IncidentDetailPage({ api = monitorApi }: { api?: MonitorApi }) {
  const { id = "" } = useParams<"id">();
  const load = useCallback(
    (signal: AbortSignal) => api.getIncidentDetail(id, { signal }),
    [api, id],
  );
  const resource = useApiResource(load);
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
      {resource.phase === "loading" && (
        <LoadingSkeleton variant="detail" label="Loading incident detail" />
      )}
      {resource.phase === "error" &&
        (isResourceNotFound(resource.error) ? (
          <EmptyState
            title="Incident Not Found"
            description={`No incident exists for ID ${id}.`}
            icon={FileSearch}
            action={
              <Link className="button button-secondary" to="/incidents">
                Return to Incidents
              </Link>
            }
          />
        ) : (
          <ErrorState
            title="Could not load incident detail"
            description={requestErrorMessage(resource.error)}
            onRetry={resource.retry}
          />
        ))}
      {resource.phase === "success" && (
        <IncidentInvestigation
          key={id}
          initial={resource.data}
          api={api}
          onReload={resource.retry}
        />
      )}
    </>
  );
}
