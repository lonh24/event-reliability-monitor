import { useEffect, useRef, useState, type SubmitEvent } from "react";
import type { MonitorApi } from "../../services/monitorApi";
import {
  applicationInput,
  configurationFailure,
} from "./configurationWorkflow";

export function ApplicationCreateForm({
  api,
  onCreated,
  onCancel,
  onReconcile,
}: {
  api: MonitorApi;
  onCreated: (name: string) => void;
  onCancel: () => void;
  onReconcile: () => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState("SANDBOX");
  const [errors, setErrors] = useState<
    ReturnType<typeof applicationInput>["errors"]
  >({});
  const [failure, setFailure] = useState<ReturnType<
    typeof configurationFailure
  > | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [reconciled, setReconciled] = useState("");
  const lock = useRef(false),
    active = useRef(true),
    nameField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    active.current = true;
    nameField.current?.focus();
    return () => {
      active.current = false;
    };
  }, []);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || failure?.uncertain) return;
    const input = applicationInput(name, environment);
    setErrors(input.errors);
    if (!input.body) {
      nameField.current?.focus();
      return;
    }
    lock.current = true;
    setPending(true);
    setFailure(null);
    setReconciled("");
    try {
      const created = await api.createApplication(input.body);
      if (active.current) onCreated(created.name);
    } catch (error: unknown) {
      if (active.current) {
        const next = configurationFailure(error);
        setFailure(next);
        const fields: typeof errors = {};
        for (const item of next.fieldErrors) {
          if (item.field === "name" || item.field === "environment")
            fields[item.field] = item.message;
        }
        setErrors(fields);
      }
    } finally {
      lock.current = false;
      if (active.current) setPending(false);
    }
  }
  async function reconcile() {
    if (lock.current) return;
    lock.current = true;
    setChecking(true);
    try {
      await onReconcile();
      if (active.current) {
        setFailure(null);
        setReconciled(
          "List reloaded. Compare the applications below before choosing to create again; names are not unique.",
        );
      }
    } catch {
      if (active.current)
        setReconciled(
          "Could not reload the list. Keep this input and try Reload applications again before another create request.",
        );
    } finally {
      lock.current = false;
      if (active.current) setChecking(false);
    }
  }
  return (
    <section className="panel" aria-labelledby="create-application-title">
      <div className="panel-header">
        <h2 id="create-application-title">Create application</h2>
        <span className="eyebrow">Demo data</span>
      </div>
      <div className="panel-body">
        <form
          className="configuration-form"
          onSubmit={submit}
          noValidate
          aria-busy={pending}
        >
          <label htmlFor="application-name">Name</label>
          <input
            ref={nameField}
            id="application-name"
            name="name"
            value={name}
            disabled={pending || checking}
            required
            aria-invalid={Boolean(errors.name)}
            aria-describedby="application-name-help application-name-error"
            onChange={(e) => setName(e.target.value)}
          />
          <p id="application-name-help" className="muted">
            1–100 characters after trimming. No service credentials are needed.
          </p>
          <p
            id="application-name-error"
            aria-live="polite"
            className="field-error"
          >
            {errors.name}
          </p>
          <label htmlFor="application-environment">Environment</label>
          <select
            id="application-environment"
            name="environment"
            value={environment}
            disabled={pending || checking}
            aria-invalid={Boolean(errors.environment)}
            aria-describedby="application-environment-error"
            onChange={(e) => setEnvironment(e.target.value)}
          >
            <option value="SANDBOX">SANDBOX</option>
            <option value="DEVELOPMENT">DEVELOPMENT</option>
          </select>
          <p
            id="application-environment-error"
            aria-live="polite"
            className="field-error"
          >
            {errors.environment}
          </p>
          {failure && (
            <div className="mutation-error" role="alert">
              <h3>{failure.title}</h3>
              <p>{failure.message}</p>
              {failure.uncertain && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={checking}
                  onClick={() => void reconcile()}
                >
                  {checking ? "Reloading…" : "Reload applications"}
                </button>
              )}
            </div>
          )}
          {reconciled && (
            <p role="status" className="context-note">
              {reconciled}
            </p>
          )}
          <div className="configuration-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={pending || checking || Boolean(failure?.uncertain)}
            >
              {pending ? "Creating…" : "Save application"}
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={pending || checking}
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
