import type {
  ApiErrorResponse,
  DtoMap,
  MonitoringRuleResponse,
} from "../types/api.ts";
import type { MonitorApi, RequestOptions } from "./monitorApi.ts";
import {
  createFixtures,
  FIXTURE_METADATA,
  utc,
  type MockDataset,
} from "../mocks/fixtures.ts";
import { overview, paginate } from "../mocks/mockQueries.ts";
import {
  applicationsQuery,
  eventsQuery,
  incidentsQuery,
  overviewQuery,
  rulesQuery,
} from "./queryValidation.ts";
import {
  pathId,
  readDto,
  requestDto,
  trimRequest,
} from "./contractValidation.ts";
import {
  compareText,
  compareTime,
  sortEventDetail,
  toEventSummary,
  toIncidentSummary,
} from "./projections.ts";
import { apiError, TransportError } from "./apiErrors.ts";

export type MockFailureCode = Extract<
  ApiErrorResponse["code"],
  | "INVALID_QUERY"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "RESOURCE_NOT_FOUND"
  | "INVALID_STATE_TRANSITION"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
>;
export interface MockOptions {
  latencyMs?: number;
  mode?: "normal" | "empty";
  dataset?: MockDataset;
}
export interface MockControls {
  reset(mode?: "normal" | "empty"): void;
  setLatency(milliseconds: number): void;
  failNext(method: keyof MonitorApi, code?: MockFailureCode): void;
}
const failureStatus: Record<MockFailureCode, number> = {
  INVALID_QUERY: 400,
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  RESOURCE_NOT_FOUND: 404,
  INVALID_STATE_TRANSITION: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TransportError("aborted", "Request was aborted."));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new TransportError("aborted", "Request was aborted."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
function validLatency(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 60000)
    throw new Error(
      "Mock latency must be an integer from 0 to 60000 milliseconds.",
    );
  return value;
}

// One factory owns one tab/session. All API methods below share the same state.
export function createMockMonitorApi(options: MockOptions = {}): {
  api: MonitorApi;
  controls: MockControls;
} {
  const seed = structuredClone(options.dataset ?? createFixtures());
  let state = structuredClone(seed),
    clock = Date.parse(FIXTURE_METADATA.snapshot),
    epoch = 0;
  let appCounter = 0,
    ruleCounter = 0,
    historyCounter = 0,
    requestCounter = 0;
  let latency = validLatency(options.latencyMs ?? 250);
  const failures = new Map<keyof MonitorApi, MockFailureCode[]>();
  const controls: MockControls = {
    reset(mode = options.mode ?? "normal") {
      if (mode !== "normal" && mode !== "empty")
        throw new Error("Unsupported mock dataset mode.");
      epoch++;
      state =
        mode === "normal"
          ? structuredClone(seed)
          : { applications: [], events: [], rules: [], incidents: [] };
      clock = Date.parse(FIXTURE_METADATA.snapshot);
      appCounter = ruleCounter = historyCounter = requestCounter = 0;
      latency = validLatency(options.latencyMs ?? 250);
      failures.clear();
    },
    setLatency(milliseconds) {
      latency = validLatency(milliseconds);
    },
    failNext(method, code = "SERVICE_UNAVAILABLE") {
      const context: Partial<Record<MockFailureCode, (keyof MonitorApi)[]>> = {
        INVALID_QUERY: [
          "getOverview",
          "listApplications",
          "listEvents",
          "listRules",
          "listIncidents",
        ],
        VALIDATION_ERROR: [
          "createApplication",
          "getEventDetail",
          "createRule",
          "updateRule",
          "getIncidentDetail",
          "updateIncidentStatus",
        ],
        RESOURCE_NOT_FOUND: [
          "getEventDetail",
          "getIncidentDetail",
          "createRule",
          "updateRule",
          "updateIncidentStatus",
        ],
        INVALID_STATE_TRANSITION: ["updateIncidentStatus"],
      };
      if (context[code] && !context[code]?.includes(method))
        throw new Error(
          "This simulated error is not valid for the selected operation.",
        );
      const queue = failures.get(method) ?? [];
      queue.push(code);
      failures.set(method, queue);
    },
  };
  controls.reset();

  async function run<N extends keyof DtoMap>(
    method: keyof MonitorApi,
    dto: N,
    work: () => DtoMap[N],
    request?: RequestOptions,
  ): Promise<DtoMap[N]> {
    const generation = epoch;
    const requestId = `mock-request-${++requestCounter}`;
    const failure = failures.get(method)?.shift();
    await delay(latency, request?.signal);
    if (epoch !== generation)
      throw new TransportError(
        "aborted",
        "Mock state was reset before the request completed.",
      );
    if (failure)
      throw apiError(
        failureStatus[failure],
        failure,
        "Simulated API failure before any state change.",
        { requestId },
      );
    // No await inside work: validation and mutation commit are atomic in this state instance.
    return structuredClone(readDto(dto, work()));
  }
  const nextTime = () => utc(++clock);
  function requireResource<T extends { id: string }>(
    items: T[],
    id: string,
  ): T {
    const item = items.find((entry) => entry.id === id);
    if (!item)
      throw apiError(
        404,
        "RESOURCE_NOT_FOUND",
        "The requested resource does not exist.",
        { requestId: "mock-resource-lookup" },
      );
    return item;
  }
  function freshId(prefix: string, kind: "app" | "rule" | "history"): string {
    const existing = new Set(
      kind === "app"
        ? state.applications.map((item) => item.id)
        : kind === "rule"
          ? state.rules.map((item) => item.id)
          : state.incidents.flatMap((item) =>
              item.history.map((entry) => entry.id),
            ),
    );
    let id: string;
    do {
      const count =
        kind === "app"
          ? ++appCounter
          : kind === "rule"
            ? ++ruleCounter
            : ++historyCounter;
      id = `${prefix}-${String(count).padStart(3, "0")}`;
    } while (existing.has(id));
    return id;
  }
  const api: MonitorApi = {
    async getOverview(query, request) {
      const q = overviewQuery(query);
      return run(
        "getOverview",
        "OverviewResponse",
        () => overview(state, clock, q),
        request,
      );
    },
    async listApplications(query, request) {
      const q = applicationsQuery(query);
      return run(
        "listApplications",
        "ApplicationPageResponse",
        () =>
          paginate(
            [...state.applications].sort(
              (a, b) =>
                compareTime(
                  a.createdAt,
                  b.createdAt,
                  q.sort.endsWith("desc"),
                ) || compareText(a.id, b.id),
            ),
            q.page,
            q.size,
          ),
        request,
      );
    },
    async createApplication(input, request) {
      const body = structuredClone(
        requestDto("CreateApplicationRequest", trimRequest(input)),
      );
      return run(
        "createApplication",
        "ApplicationResponse",
        () => {
          const result = {
            id: freshId("app-new", "app"),
            name: body.name,
            environment: body.environment,
            status: "ACTIVE" as const,
            createdAt: nextTime(),
          };
          state.applications.push(result);
          return result;
        },
        request,
      );
    },
    async listEvents(query, request) {
      const q = eventsQuery(query);
      return run(
        "listEvents",
        "EventPageResponse",
        () =>
          paginate(
            state.events
              .filter(
                (event) =>
                  (!q.applicationId ||
                    event.applicationId === q.applicationId) &&
                  (!q.status || event.processingStatus === q.status) &&
                  event.eventId.toLowerCase().includes(q.search.toLowerCase()),
              )
              .sort(
                (a, b) =>
                  compareTime(
                    a.occurredAt,
                    b.occurredAt,
                    q.sort.endsWith("desc"),
                  ) || compareText(a.id, b.id),
              )
              .map(toEventSummary),
            q.page,
            q.size,
          ),
        request,
      );
    },
    async getEventDetail(input, request) {
      const id = pathId(input);
      return run(
        "getEventDetail",
        "EventDetailResponse",
        () =>
          sortEventDetail(structuredClone(requireResource(state.events, id))),
        request,
      );
    },
    async listRules(query, request) {
      const q = rulesQuery(query);
      return run(
        "listRules",
        "RulePageResponse",
        () =>
          paginate(
            state.rules
              .filter(
                (rule) =>
                  !q.applicationId || rule.applicationId === q.applicationId,
              )
              .sort(
                (a, b) =>
                  compareText(a.name.toLowerCase(), b.name.toLowerCase()) *
                    (q.sort.endsWith("desc") ? -1 : 1) ||
                  compareText(a.id, b.id),
              ),
            q.page,
            q.size,
          ),
        request,
      );
    },
    async createRule(input, request) {
      const body = structuredClone(
        requestDto("CreateRuleRequest", trimRequest(input)),
      );
      return run(
        "createRule",
        "MonitoringRuleResponse",
        () => {
          requireResource(state.applications, body.applicationId);
          const common = {
            id: freshId("rule-new", "rule"),
            applicationId: body.applicationId,
            name: body.name,
            description: body.description ?? "",
            enabled: body.enabled ?? true,
            configVersion: "1",
            updatedAt: nextTime(),
            relatedEventIds: [],
            relatedIncidentIds: [],
          };
          let result: MonitoringRuleResponse;
          switch (body.ruleType) {
            case "TIMEOUT":
              result = {
                ...common,
                ruleType: body.ruleType,
                config: body.config,
              };
              break;
            case "DUPLICATE_BUSINESS_EFFECT":
              result = {
                ...common,
                ruleType: body.ruleType,
                config: body.config,
              };
              break;
            case "DATA_INVARIANT":
              result = {
                ...common,
                ruleType: body.ruleType,
                config: body.config,
              };
              break;
          }
          state.rules.push(result);
          return result;
        },
        request,
      );
    },
    async updateRule(input, value, request) {
      const id = pathId(input),
        body = structuredClone(requestDto("UpdateRuleRequest", value));
      return run(
        "updateRule",
        "MonitoringRuleResponse",
        () => {
          const rule = requireResource(state.rules, id);
          if (rule.enabled !== body.enabled) {
            rule.enabled = body.enabled;
            rule.updatedAt = nextTime();
          }
          return rule;
        },
        request,
      );
    },
    async listIncidents(query, request) {
      const q = incidentsQuery(query);
      return run(
        "listIncidents",
        "IncidentPageResponse",
        () =>
          paginate(
            state.incidents
              .filter(
                (incident) =>
                  (!q.applicationId ||
                    incident.applicationId === q.applicationId) &&
                  (!q.status || incident.status === q.status) &&
                  (!q.severity || incident.severity === q.severity),
              )
              .sort(
                (a, b) =>
                  compareTime(
                    a.openedAt,
                    b.openedAt,
                    q.sort.endsWith("desc"),
                  ) || compareText(a.id, b.id),
              )
              .map(toIncidentSummary),
            q.page,
            q.size,
          ),
        request,
      );
    },
    async getIncidentDetail(input, request) {
      const id = pathId(input);
      return run(
        "getIncidentDetail",
        "IncidentDetailResponse",
        () => {
          const incident = structuredClone(
            requireResource(state.incidents, id),
          );
          incident.linkedEvent = toEventSummary(
            requireResource(state.events, incident.observedEventId),
          );
          incident.history.sort(
            (a, b) =>
              compareTime(a.createdAt, b.createdAt) || compareText(a.id, b.id),
          );
          incident.evidence.sort(
            (a, b) =>
              compareTime(a.collectedAt, b.collectedAt) ||
              compareText(a.id, b.id),
          );
          return incident;
        },
        request,
      );
    },
    async updateIncidentStatus(input, value, request) {
      const id = pathId(input),
        body = structuredClone(
          requestDto("UpdateIncidentStatusRequest", value),
        );
      return run(
        "updateIncidentStatus",
        "IncidentDetailResponse",
        () => {
          const incident = requireResource(state.incidents, id);
          if (incident.version !== body.expectedVersion)
            throw apiError(
              409,
              "VERSION_CONFLICT",
              "The incident changed. Reload its detail before deciding the next action.",
              {
                currentVersion: incident.version,
                requestId: "mock-version-conflict",
              },
            );
          if (incident.status === body.status) return incident;
          if (
            !(
              (incident.status === "OPEN" && body.status === "INVESTIGATING") ||
              (incident.status === "INVESTIGATING" &&
                body.status === "RESOLVED")
            )
          )
            throw apiError(
              409,
              "INVALID_STATE_TRANSITION",
              "Only OPEN to INVESTIGATING to RESOLVED transitions are allowed.",
            );
          const version = BigInt(incident.version) + 1n;
          if (version > 9223372036854775807n)
            throw apiError(
              500,
              "INTERNAL_ERROR",
              "The incident version exceeds the contract range.",
            );
          const previous = incident.status,
            time = nextTime();
          incident.status = body.status;
          incident.version = String(version);
          incident.updatedAt = time;
          incident.resolvedAt = body.status === "RESOLVED" ? time : null;
          incident.history.push({
            id: freshId("hist-new", "history"),
            action: "STATUS_CHANGED",
            fromStatus: previous,
            toStatus: body.status,
            actorRef: "local-developer",
            note: body.note ?? "",
            createdAt: time,
          });
          return incident;
        },
        request,
      );
    },
  };
  return { api, controls };
}
