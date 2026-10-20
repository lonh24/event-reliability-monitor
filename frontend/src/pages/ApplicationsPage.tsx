import { Boxes } from "lucide-react";
import { useCallback, useState } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import { DataTable } from "../components/ui/DataTable";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ApplicationCreateForm } from "../components/monitoring/ApplicationCreateForm";
import { applicationDirectory } from "../components/monitoring/applicationDirectory";
import {
  requestErrorMessage,
  utcTime,
} from "../components/monitoring/presentation";
import { useApiResource } from "../hooks/useApiResource";
import { monitorApi, type MonitorApi } from "../services/index";

export function ApplicationsPage({ api = monitorApi }: { api?: MonitorApi }) {
  const load = useCallback(
    (signal: AbortSignal) => applicationDirectory(api, signal),
    [api],
  );
  const resource = useApiResource(load);
  const [creating, setCreating] = useState(false),
    [success, setSuccess] = useState("");
  return (
    <>
      <PageHeader
        title="Applications"
        description="Manage the application context for the events you investigate."
        action={
          <button
            type="button"
            className="button button-primary"
            disabled={creating}
            onClick={() => {
              setSuccess("");
              setCreating(true);
            }}
          >
            Create application
          </button>
        }
      />
      {success && (
        <p className="mutation-success" role="status">
          {success}
        </p>
      )}
      {creating && (
        <ApplicationCreateForm
          api={api}
          onCancel={() => setCreating(false)}
          onCreated={(name) => {
            setSuccess(
              `Application “${name}” created. Reloading the directory…`,
            );
            setCreating(false);
            resource.retry();
          }}
          onReconcile={async () => {
            await applicationDirectory(api);
            resource.retry();
          }}
        />
      )}
      <section className="panel" aria-labelledby="applications-title">
        <div className="panel-header">
          <h2 id="applications-title">Application directory</h2>
          <span className="eyebrow">Demo data</span>
        </div>
        <div aria-live="polite" aria-busy={resource.phase === "loading"}>
          {resource.phase === "loading" && (
            <div className="panel-body">
              <LoadingSkeleton variant="table" label="Loading applications" />
            </div>
          )}
          {resource.phase === "error" && (
            <ErrorState
              title="Could not load applications"
              description={requestErrorMessage(resource.error)}
              onRetry={resource.retry}
            />
          )}
          {resource.phase === "success" && (
            <>
              <DataTable
                caption="Applications"
                columns={[
                  { id: "name", label: "Application / ID" },
                  { id: "environment", label: "Environment" },
                  { id: "status", label: "Status" },
                  { id: "created", label: "Created at · UTC" },
                ]}
                emptyState={
                  <EmptyState
                    icon={Boxes}
                    title="No applications configured"
                    description="The directory loaded successfully. Create a sample application to begin."
                  />
                }
              >
                {resource.data.map((app) => (
                  <tr key={app.id}>
                    <td>
                      {app.name}
                      <small className="cell-description mono">{app.id}</small>
                    </td>
                    <td>{app.environment}</td>
                    <td>
                      <StatusBadge
                        label={app.status}
                        tone={app.status === "ACTIVE" ? "success" : "disabled"}
                      />
                    </td>
                    <td className="nowrap">{utcTime(app.createdAt)}</td>
                  </tr>
                ))}
              </DataTable>
              <p className="list-summary" role="status">
                {resource.data.length} applications · All records · Newest first
                (createdAt DESC)
              </p>
            </>
          )}
        </div>
      </section>
      <p className="context-note">
        Demo changes share this session. A full browser reload restores the
        initial snapshot. Creating an application does not connect a live
        service or create events, rules or topics.
      </p>
    </>
  );
}
