// Actual production components with one isolated adapter; not a build entry.
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../../src/app/AppShell";
import { ApplicationsPage } from "../../src/pages/ApplicationsPage";
import { RulesPage } from "../../src/pages/RulesPage";
import { EventsPage } from "../../src/pages/EventsPage";
import { EventDetailPage } from "../../src/pages/EventDetailPage";
import { IncidentDetailPage } from "../../src/pages/IncidentDetailPage";
import { OverviewPage } from "../../src/pages/OverviewPage";
import { IncidentsPage } from "../../src/pages/IncidentsPage";
import { createMockMonitorApi } from "../../src/services/mockMonitorApi";
import { createHttpMonitorApi } from "../../src/services/httpMonitorApi";
import { apiError, TransportError } from "../../src/services/apiErrors";
import type { MonitorApi, RulesQuery } from "../../src/services/monitorApi";
import "../../src/styles/tokens.css";
import "../../src/styles/global.css";
const params = new URLSearchParams(location.search),
  mode = params.get("mode"),
  page = params.get("page") ?? "applications";
const instance = createMockMonitorApi({
  latencyMs: mode === "slow" ? 800 : 20,
  mode: mode === "empty" ? "empty" : "normal",
});
const writes: { method: string; body: unknown; id?: string }[] = [],
  queries: { method: string; query: unknown }[] = [];
let injected = false;
if (mode === "error")
  instance.controls.failNext(
    page === "rules" ? "listRules" : "listApplications",
    "SERVICE_UNAVAILABLE",
  );
if (mode === "app-error")
  instance.controls.failNext("listApplications", "SERVICE_UNAVAILABLE");
if (mode === "save-error")
  instance.controls.failNext(
    page === "rules" ? "updateRule" : "createApplication",
    "SERVICE_UNAVAILABLE",
  );
const api: MonitorApi =
  mode === "http"
    ? createHttpMonitorApi()
    : {
        ...instance.api,
        async listApplications(query, options) {
          queries.push({
            method: "listApplications",
            query: structuredClone(query),
          });
          return instance.api.listApplications(query, options);
        },
        async listRules(query, options) {
          queries.push({ method: "listRules", query: structuredClone(query) });
          if (mode === "page-shrink" && query?.page === 1)
            instance.controls.reset("empty");
          const result = await instance.api.listRules(
            query,
            mode === "race" ? undefined : options,
          );
          if (mode === "race" && query?.applicationId === "app-001")
            await new Promise((r) => setTimeout(r, 600));
          return result;
        },
        async createApplication(body, options) {
          writes.push({
            method: "createApplication",
            body: structuredClone(body),
          });
          if (mode === "validation" && !injected) {
            injected = true;
            throw apiError(400, "VALIDATION_ERROR", "Rejected", {
              fieldErrors: [
                {
                  field: "name",
                  code: "INVALID",
                  message: "Choose a different sample name.",
                },
              ],
            });
          }
          const result = await instance.api.createApplication(body, options);
          if (mode === "lost-ack" && !injected) {
            injected = true;
            throw new TransportError("network", "Lost confirmation");
          }
          return result;
        },
        async updateRule(id, body, options) {
          writes.push({
            method: "updateRule",
            id,
            body: structuredClone(body),
          });
          const result = await instance.api.updateRule(id, body, options);
          if (mode === "lost-ack" && !injected) {
            injected = true;
            throw new TransportError("network", "Lost confirmation");
          }
          return result;
        },
      };
const bridge = {
  writes,
  queries,
  controls: instance.controls,
  detail: () => instance.api.getEventDetail("evt-003"),
  incident: () => instance.api.getIncidentDetail("inc-001"),
  rules: (query?: RulesQuery) => instance.api.listRules(query),
};
declare global {
  interface Window {
    ermConfigurationTest: typeof bridge;
  }
}
window.ermConfigurationTest = bridge;
createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={[`/${page}`]}>
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<OverviewPage api={api} />} />
        <Route path="applications" element={<ApplicationsPage api={api} />} />
        <Route path="rules" element={<RulesPage api={api} />} />
        <Route path="events" element={<EventsPage api={api} />} />
        <Route path="events/:id" element={<EventDetailPage api={api} />} />
        <Route path="incidents" element={<IncidentsPage api={api} />} />
        <Route
          path="incidents/:id"
          element={<IncidentDetailPage api={api} />}
        />
      </Route>
    </Routes>
  </MemoryRouter>,
);
