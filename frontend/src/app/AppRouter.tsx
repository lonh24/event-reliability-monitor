import { Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { OverviewPage } from "../pages/OverviewPage";

import { EventsPage } from "../pages/EventsPage";
import { lazy, Suspense } from "react";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";

const ApplicationsPage = lazy(() =>
  import("../pages/ApplicationsPage").then((module) => ({
    default: module.ApplicationsPage,
  })),
);
const RulesPage = lazy(() =>
  import("../pages/RulesPage").then((module) => ({
    default: module.RulesPage,
  })),
);
const EventDetailPage = lazy(() =>
  import("../pages/EventDetailPage").then((module) => ({
    default: module.EventDetailPage,
  })),
);

import { IncidentsPage } from "../pages/IncidentsPage";
const IncidentDetailPage = lazy(() =>
  import("../pages/IncidentDetailPage").then((module) => ({
    default: module.IncidentDetailPage,
  })),
);
import { NotFoundPage } from "../pages/NotFoundPage";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route
          path="applications"
          element={
            <Suspense
              fallback={
                <LoadingSkeleton
                  variant="table"
                  label="Loading applications screen"
                />
              }
            >
              <ApplicationsPage />
            </Suspense>
          }
        />
        <Route path="events" element={<EventsPage />} />
        <Route
          path="events/:id"
          element={
            <Suspense
              fallback={
                <LoadingSkeleton
                  variant="detail"
                  label="Loading event detail screen"
                />
              }
            >
              <EventDetailPage />
            </Suspense>
          }
        />
        <Route
          path="rules"
          element={
            <Suspense
              fallback={
                <LoadingSkeleton variant="table" label="Loading rules screen" />
              }
            >
              <RulesPage />
            </Suspense>
          }
        />
        <Route path="incidents" element={<IncidentsPage />} />
        <Route
          path="incidents/:id"
          element={
            <Suspense
              fallback={
                <LoadingSkeleton
                  variant="detail"
                  label="Loading incident detail screen"
                />
              }
            >
              <IncidentDetailPage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
