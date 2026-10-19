# ERM Dashboard

React + TypeScript + Vite dashboard with a Dark Emerald application shell and a typed data layer. Overview, Event Explorer, Event Detail and both incident pages read through MonitorApi. Applications and Rules remain scaffold placeholders. Unavailable metrics use a dash rather than zero; a missing event returns a distinct Event Not Found state. There is no live monitoring or Backend runtime.

## Requirements and commands

Use Node.js 22.12+ on the 22.x line, or Node.js 24+, with npm 10+. From the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. Keep the dev process running; Ctrl+C stops it. No Java, Kafka or PostgreSQL is needed for mock mode.

```bash
npm run contract:check
npm run typecheck:tests
npm test
npm run build
npm run lint
npm run preview
```

Tests use Node's built-in test runner with TypeScript stripping; `typecheck:tests` checks their types separately. No separate test framework is required. Build type-checks the application and writes static files to `dist/`. Lint uses Oxlint. Preview serves a completed build locally and is not a production server. A static deployment must rewrite client routes to `index.html` for direct detail URLs.

## Data sources

The default is mock mode. Optionally copy `.env.example` to `.env` and set:

```dotenv
VITE_DATA_SOURCE=mock
VITE_API_BASE_URL=/api/v1
```

Restart Vite after changing environment values. `mock` uses one in-memory adapter instance exported as `monitorApi` from `src/services/index.ts`; it performs no HTTP calls. `http` selects the real fetch adapter for all eleven Dashboard operations. Unsupported modes fail explicitly. Every `VITE_*` value is client-visible; never put secrets or internal service tokens there.

HTTP mode implements method/path/query/body serialization, validated responses, structured API errors and AbortSignal handling. It has been exercised with HTTP response doubles; integration with a real Spring Boot Backend is pending. `/api/v1` is appended only once. A relative base uses the frontend origin and needs a server/reverse proxy that handles that path. A separately hosted API can use an absolute HTTP(S) base ending in `/api/v1`, with suitable server-side CORS. No proxy or Backend is started by this project. The five connected pages use the selected adapter in both modes. The remaining scaffold pages do not make requests yet.

Consumers will call the shared abstraction instead of importing fixtures:

```typescript
import { monitorApi } from "./services/index.ts";

const event = await monitorApi.getEventDetail("evt-003");
```

Calls reject `MonitorApiError` for API errors (`status`, `code`, `response`), or `TransportError` for network/protocol/abort failures. A rule outcome `UNKNOWN` is successful business data, not a transport failure. POST mutations are not automatically retried after an uncertain response.

## Mock data and controls

`src/mocks/fixtures.ts` builds a fresh visible dataset from [Mock Data Spec](../docs/07-mock-data-spec.md): 2 applications, 30 observed events, 6 rules, 5 incidents, 25 reported attempts, 27 reports and 93 evaluations (90 latest plus 3 historical revisions). The seed is `20261017` and the reference snapshot is `2026-10-17T10:10:00Z`. No current clock or random source changes business results.

The full initial overview computes 30 observed / 18 confirmed / 3 open / 26 unknown evaluations. The one-hour core subset remains 5 / 3 / 1 / 4. These values are test expectations; the adapter computes totals and UTC buckets from visible records. Report loss never fabricates attempts or converts an unknown effect count to zero. `evt-003` links to `inc-001` and the labelled sandbox effects `eff-003-1` / `eff-003-2`.

Mutations share the same state inside one adapter instance: application/rule creation, desired rule enabled state and version-checked incident transitions. Reload resets data, IDs, logical clock and fault controls. There is no localStorage, cross-tab synchronization or production persistence. Rule toggles do not recompute history; resolving an incident does not repair its ledger or rewrite evaluations.

For isolated loading/error/empty tests:

```typescript
import { createMockMonitorApi } from "./services/mockMonitorApi.ts";

const { api, controls } = createMockMonitorApi({ latencyMs: 0 });
controls.failNext("getOverview", "SERVICE_UNAVAILABLE"); // one-shot, before mutation
controls.reset("empty"); // successful empty dataset; detail lookup returns 404
controls.reset(); // restore the original snapshot and counters
controls.setLatency(1000); // fixed slow profile; default is 250ms
```

Each factory has isolated state. Responses are clones, and pending requests are cancelled when the state is reset. Invalid input, injected failures, cancellation and no-op updates do not consume the business clock or IDs. Status transitions permit only OPEN → INVESTIGATING → RESOLVED; stale versions return 409 before transition checks.

## Contract and structure

- `src/types/api.ts`, `api.schema.json`: derived Dashboard DTO types and JSON Schema; BIGINT values use decimal strings.
- `src/services/monitorApi.ts`: eleven Promise-based operations and typed queries/options.
- `src/services/mockMonitorApi.ts`, `httpMonitorApi.ts`, `index.ts`: mock/HTTP implementations and selection.
- `src/services/contractValidation.ts`, `queryValidation.ts`, `apiErrors.ts`, `projections.ts`: boundary validation, safe errors and projections.
- `src/mocks/`: deterministic fixtures and aggregate/pagination helpers.
- `src/app/`, `components/`, `pages/`, `styles/`: the application shell, presentation components, data-backed monitoring screens, remaining scaffold pages and responsive styles.
- `tests/`: contract/type, fixture, mock behavior and HTTP transport tests.

[API Contract](../docs/06-api-contract.md) is authoritative. `npm run contract:sync` regenerates the two derived files from its normative schema; `contract:check` detects drift. Two internal processing-report DTOs are deliberately excluded from browser types. Do not edit generated files or change the approved contract to hide a test failure. Ajv and ajv-formats provide runtime JSON Schema validation without coercion, default insertion or dropping unknown properties; separate checks preserve Int64 bounds.

## Routes and current UI scope

| Path             | Page                                      |
| ---------------- | ----------------------------------------- |
| `/`              | Overview                                  |
| `/applications`  | Applications                              |
| `/events`        | Event Explorer                            |
| `/events/:id`    | Event detail, using observation record ID |
| `/rules`         | Monitoring Rules                          |
| `/incidents`     | Incidents                                 |
| `/incidents/:id` | Incident detail                           |
| `*`              | 404 with a link to Overview               |

The sidebar has five destinations. Details return to their parent lists. The mobile navigation drawer supports close, Escape and keyboard navigation.

Overview uses the API snapshot (default 24h/hour), four cards, a responsive Recharts volume chart with partial UTC buckets, an accessible exact-count table and latest incident links. Its initial mock totals are 30 / 18 / 3 / 26; these are computed by the adapter, not constants in the page. The chart loads separately.

Event Explorer searches logical eventId (trimmed, case-insensitive, up to 128 characters), combines application/processing filters with AND and uses server-style pagination (ten records per page, zero-based in the API). Changing conditions resets to the first page. Clear filters restores defaults. Filter choices load all application pages. Loading replaces prior-query records; cancelled or stale responses cannot overwrite a newer query. Retry retains the query. If a page becomes invalid after a dataset change, the UI fetches a valid page using response metadata.

Event Detail uses the observed-record ID in its URL. It shows metadata, reported attempts and original reports, conflicts, latest versus historical evaluations, evidence references and read-only ledger snapshots. Null values remain unknown/unavailable; no attempts or effects are inferred from missing reports. Source, coverage, trust, finality, gaps, masked customer references and sandbox injected-ledger labels are visible. Evidence is one anchor away. Incident links open the investigation detail and status workflow.

Applications create and Rules toggle remain outside the current UI. Loading/empty/error/not-found states are distinct. No live Backend, Kafka or database is started.

## Reproducible UI checks

The optional browser runner uses Playwright as a local development tool; no browser framework or new runtime dependency is added to package.json:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:ui
```

After a fresh npm ci, reinstall that optional tool if needed. npm run test:ui starts and stops its own local Vite server. It checks the actual routes and isolated component entry, search/filter/page/reset, five scenarios, conflict/history, responsive layouts, keyboard navigation, pending/empty/error/retry, stale responses and HTTP adapter response doubles. It requires a working local Chromium installation. HTTP doubles are not Spring Boot integration tests.

For manual fault checks, run npm run dev and open `/tests/ui/harness.html?page=overview&mode=slow`. Use page=overview|events|detail and mode=slow|empty|error; detail also accepts id=evt-005. The error mode fails once: Retry recovers. mode=app-error on Events isolates an application-filter failure. mode=race simulates an old search response arriving late. This test entry is not a production build input and uses its own mock instance; it never changes the main dashboard singleton.

A manual check takes about five minutes: verify the four Overview values and chart; search ORDER-PAID-1003; combine app/status filters and clear; switch Events pages; inspect evt-002 through evt-005; follow an evidence link; open /events/missing-id; then use the isolated empty/error/slow modes. Check a narrow viewport as well.

## Incident investigation

Incidents uses `listIncidents` with status/severity filters combined by AND, sorted by openedAt descending. The demo uses two records per page to make pagination visible on five cases. Changing filters resets page 0; clear restores defaults. Requests are cancelled/guarded against stale responses, Retry retains filters and an invalidated page triggers a valid-page request. Free-text incident search is not part of the API contract.

Incident Detail reads the aggregate DTO from `getIncidentDetail`: primary rule, linked event, linked persisted evaluations, read-only evidence and ordered server history. Event links use observedEventId, never logical eventId. Case assessments are not relabelled as current business truth after resolution. Evidence report references open Event Detail instead of pointing to a report anchor absent from Incident Detail.

The status form offers only OPEN → INVESTIGATING → RESOLVED. An optional trimmed note (up to 500 characters) is saved with the change. The page submits its loaded version string as expectedVersion and adopts the API response for status, revision, resolvedAt and history. While saving it prevents double submission; it never increments revision or invents history locally.

Every mutation failure requires an explicit Reload detail before another write. VERSION_CONFLICT and INVALID_STATE_TRANSITION have separate messages. If a network/protocol error hides the result of a committed PATCH, the UI states that the outcome is uncertain and reads the latest detail before a person chooses the next action. It never automatically retries a PATCH with a new version. Navigating away may leave an in-flight write to finish; returning to the case reads its actual state.

Resolving inc-001 changes open incidents 3 → 3 → 2 across its two transitions. It preserves evt-003, both injected ledger effects (+200) and linked VIOLATION assessments. Navigating between pages shares the adapter session; a full browser reload restores the initial mock snapshot. This is not durable or cross-tab storage, a real database transaction or Spring Boot concurrency verification.

To run incident browser checks after the optional Playwright setup above:

```bash
npm run test:ui
npm run test:ui:incidents
```

The original runner retains its 4A assertions; the incident runner adds filters/pages, the three-action investigation flow, valid transitions/revisions/history, shared projections, reload reset, real stale-version rejection, pending/double-submit prevention and failure reconciliation. HTTP requests are response doubles rather than a running Backend.

The isolated incident entry is `/tests/ui/incidents-harness.html?page=detail&mode=conflict`. Use page=list|detail, optional id=inc-001, and mode=slow|empty|error. Additional detail modes: mutation-error (one-shot 503), invalid-transition (injected 409 rejection), conflict (another legitimate mutation wins before the stale UI request), lost-ack (a real mock commit occurs before its response is lost). List modes race and page-shrink verify stale responses and invalidated pagination. The harness owns an isolated API instance and never patches the dashboard singleton.
