// Isolated fault controls. This entry is not a production build input.
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OverviewPage } from "../../src/pages/OverviewPage";
import { IncidentsPage } from "../../src/pages/IncidentsPage";
import { IncidentDetailPage } from "../../src/pages/IncidentDetailPage";
import { EventDetailPage } from "../../src/pages/EventDetailPage";
import { createMockMonitorApi } from "../../src/services/mockMonitorApi";
import { createHttpMonitorApi } from "../../src/services/httpMonitorApi";
import { TransportError } from "../../src/services/apiErrors";
import type { IncidentsQuery, MonitorApi } from "../../src/services/monitorApi";
import type { UpdateIncidentStatusRequest } from "../../src/types/api";
import "../../src/styles/tokens.css";
import "../../src/styles/global.css";

const params = new URLSearchParams(location.search),
  mode = params.get("mode"),
  page = params.get("page") ?? "detail";
const instance = createMockMonitorApi({
  latencyMs: mode === "slow" ? 900 : 20,
  mode: mode === "empty" ? "empty" : "normal",
});
const queries: IncidentsQuery[] = [],
  mutations: { id: string; body: UpdateIncidentStatusRequest }[] = [];
let injected = false;
if (mode === "error")
  instance.controls.failNext(
    page === "list" ? "listIncidents" : "getIncidentDetail",
    "SERVICE_UNAVAILABLE",
  );
if (mode === "mutation-error")
  instance.controls.failNext("updateIncidentStatus", "SERVICE_UNAVAILABLE");
if (mode === "invalid-transition")
  instance.controls.failNext(
    "updateIncidentStatus",
    "INVALID_STATE_TRANSITION",
  );
const api: MonitorApi =
  mode === "http"
    ? createHttpMonitorApi()
    : {
        ...instance.api,
        async listIncidents(query, options) {
          queries.push(structuredClone(query ?? {}));
          if (mode === "page-shrink" && query?.page === 1)
            instance.controls.reset("empty");
          const result = await instance.api.listIncidents(
            query,
            mode === "race" ? undefined : options,
          );
          if (mode === "race" && query?.status === "OPEN")
            await new Promise((resolve) => setTimeout(resolve, 600));
          return result;
        },
        async updateIncidentStatus(id, body, options) {
          mutations.push({ id, body: structuredClone(body) });
          if (mode === "conflict" && !injected) {
            injected = true;
            const latest = await instance.api.getIncidentDetail(id);
            await instance.api.updateIncidentStatus(id, {
              status: "INVESTIGATING",
              expectedVersion: latest.version,
              note: "Another investigator advanced the case",
            });
          }
          const result = await instance.api.updateIncidentStatus(
            id,
            body,
            options,
          );
          if (mode === "lost-ack" && !injected) {
            injected = true;
            throw new TransportError(
              "network",
              "Simulated lost acknowledgement after commit.",
            );
          }
          return result;
        },
      };
const testControl = {
  queries,
  mutations,
  controls: instance.controls,
  detail: () => instance.api.getIncidentDetail(params.get("id") ?? "inc-001"),
  overview: () => instance.api.getOverview(),
};
declare global {
  interface Window {
    ermIncidentTest: typeof testControl;
  }
}
window.ermIncidentTest = testControl;
const root = document.getElementById("root");
if (!root) throw new Error("Missing UI test root");
const path =
  page === "list"
    ? "/incidents"
    : `/incidents/${params.get("id") ?? "inc-001"}`;
createRoot(root).render(
  <MemoryRouter initialEntries={[path]}>
    <main className="content">
      <span className="demo-label">Demo data · isolated incident test</span>
      <Routes>
        <Route path="/" element={<OverviewPage api={api} />} />
        <Route path="/incidents" element={<IncidentsPage api={api} />} />
        <Route
          path="/incidents/:id"
          element={<IncidentDetailPage api={api} />}
        />
        <Route path="/events/:id" element={<EventDetailPage api={api} />} />
      </Routes>
    </main>
  </MemoryRouter>,
);
