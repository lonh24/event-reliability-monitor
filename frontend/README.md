# ERM Dashboard

React + TypeScript + Vite dashboard with a Dark Emerald application shell and a typed data layer. The eight pages remain placeholders and are not yet connected to that data layer. Unavailable metrics use a dash rather than zero; detail URLs display the requested ID without assuming a record exists. There is no live monitoring or Backend runtime.

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

HTTP mode implements method/path/query/body serialization, validated responses, structured API errors and AbortSignal handling. It has been exercised with HTTP response doubles; integration with a real Spring Boot Backend is pending. `/api/v1` is appended only once. A relative base uses the frontend origin and needs a server/reverse proxy that handles that path. A separately hosted API can use an absolute HTTP(S) base ending in `/api/v1`, with suitable server-side CORS. No proxy or Backend is started by this project. Existing placeholder pages do not make requests in either mode yet.

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

For isolated tests or later loading/error/empty UI development:

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
- `src/app/`, `components/`, `pages/`, `styles/`: the application shell, presentation components, placeholders and responsive styles.
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

Data-backed charts, event search/filter/table UI, investigation timelines, application forms, rule toggles and incident workflow buttons remain unimplemented. Presentation components for loading, empty and error states remain available. Recharts is installed for later charts and is not imported by placeholder pages.
