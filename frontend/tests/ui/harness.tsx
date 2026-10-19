// Dev-only test entry. Vite's production input remains index.html.
// The application singleton and normal routes are never patched for fault tests.
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OverviewPage } from "../../src/pages/OverviewPage";
import { EventsPage } from "../../src/pages/EventsPage";
import { EventDetailPage } from "../../src/pages/EventDetailPage";
import { createMockMonitorApi } from "../../src/services/mockMonitorApi";
import { createHttpMonitorApi } from "../../src/services/httpMonitorApi";
import type { MockControls } from "../../src/services/mockMonitorApi";
import type { MonitorApi } from "../../src/services/monitorApi";
import "../../src/styles/tokens.css";
import "../../src/styles/global.css";

const params = new URLSearchParams(window.location.search);
const page = params.get("page") ?? "overview";
const mode = params.get("mode");
const factory = createMockMonitorApi({
  latencyMs: mode === "slow" ? 900 : 20,
  mode: mode === "empty" ? "empty" : "normal",
});
const calls: {
  method: string;
  search?: string;
  page?: number;
  aborted: boolean;
}[] = [];
const method =
  page === "events"
    ? "listEvents"
    : page === "detail"
      ? "getEventDetail"
      : "getOverview";
if (mode === "error") factory.controls.failNext(method, "SERVICE_UNAVAILABLE");
if (mode === "app-error")
  factory.controls.failNext("listApplications", "SERVICE_UNAVAILABLE");
const api: MonitorApi =
  mode === "http"
    ? createHttpMonitorApi()
    : {
        ...factory.api,
        async listEvents(query, options) {
          const call = {
            method: "listEvents",
            search: query?.search,
            page: query?.page,
            aborted: false,
          };
          calls.push(call);
          options?.signal?.addEventListener(
            "abort",
            () => {
              call.aborted = true;
            },
            { once: true },
          );
          // Deliberately ignore abort in this transport to verify the hook's active guard too.
          const result = await factory.api.listEvents(query);
          if (mode === "race" && query?.search === "1003")
            await new Promise((resolve) => setTimeout(resolve, 650));
          return result;
        },
      };
declare global {
  interface Window {
    ermUiTest: { calls: typeof calls; controls: MockControls };
  }
}
window.ermUiTest = { calls, controls: factory.controls };
const root = document.getElementById("root");
if (!root) throw new Error("Missing UI test root");
const route =
  page === "events"
    ? "/events"
    : page === "detail"
      ? `/events/${params.get("id") ?? "evt-003"}`
      : "/";
createRoot(root).render(
  <MemoryRouter initialEntries={[route]}>
    <main className="content">
      <span className="demo-label">Demo data · isolated test</span>
      <Routes>
        <Route path="/" element={<OverviewPage api={api} />} />
        <Route path="/events" element={<EventsPage api={api} />} />
        <Route path="/events/:id" element={<EventDetailPage api={api} />} />
        <Route
          path="/incidents/:id"
          element={<p>Existing incident route; workflow is outside 4A.</p>}
        />
      </Routes>
    </main>
  </MemoryRouter>,
);
