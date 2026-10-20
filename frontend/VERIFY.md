# Verify the mock dashboard

Use this checklist for a fresh checkout or when reviewing a frontend change. It
verifies the mock frontend and its contract; it does not start or verify Spring
Boot, Kafka, PostgreSQL, production hosting, or durable storage.

## Prerequisites and baseline

- Node.js 22.12+ on the 22.x line, or Node.js 24+, and npm 10+ (see package.json).
- Git, a browser, and access to the npm registry for installation.
- The 4C reference is `3e9e218c55f7d0072f802b37c1c4e76cfe417204`.
  Review the intended changes on top of that reference; do not reset an existing
  working directory to obtain it.
- Use a clean checkout. Check `git status --short` and `git rev-parse HEAD` first.
  Keep existing work in its own checkout instead of overwriting it.

From the repository root:

```bash
node --version
npm --version
cd frontend
npm ci
npm run contract:check
npm run typecheck:tests
npm test
npm run build
npm run lint
```

Every command must exit successfully. `build` also checks application TypeScript;
`typecheck:tests` checks tests and harnesses. `contract:check` compares generated
DTOs/schema to the normative contract, while Node tests also validate examples,
fixture relationships, evidence arithmetic, adapter behavior and error handling.
A green build alone does not establish that browser interactions work.

The default data source is mock. For an explicit configuration, copy
`.env.example` to `.env` only when `.env` does not already exist, then set
`VITE_DATA_SOURCE=mock` and `VITE_API_BASE_URL=/api/v1`. Never overwrite existing
configuration or put secrets in client-visible `VITE_*` values. Restart Vite after
changing env values, and rebuild before testing a new production bundle.

## Automated browser verification

Playwright is optional development tooling. In the frontend directory:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:ui
npm run test:ui:incidents
npm run test:ui:configuration
npm run test:ui:production
```

Run suites sequentially. Each starts and closes its own loopback server and
browser. The first three use the dev server and isolated fault harnesses. The
production suite requires the preceding build and serves `dist/` using Vite
preview; it imports no source fixtures, intercepts no API, and checks built lazy
chunks, direct routes, rendered application 404, all three mutations, reset,
mobile focus and runtime/network failures. Preview is a local verification
server, not a production deployment.

After another `npm ci`, reinstall optional tooling if needed. A machine with a
preinstalled Playwright module/browser may set `ERM_PLAYWRIGHT_MODULE`,
`ERM_BROWSER_EXECUTABLE` and `ERM_BROWSER_ARGS` (a JSON array of launch arguments).
Do not disable browser security in a normal desktop environment.
`ERM_UI_OUTPUT` optionally selects a results directory. Prefer an ignored path
under `.codex-private/evidence/`; never commit local execution logs/screenshots.
Do not claim browser PASS when the browser cannot launch or a suite exits nonzero.

## Manual acceptance in at most ten minutes

Install/build time is separate from this interactive check. On Windows PowerShell,
use `npm.cmd` instead of `npm` if an execution policy blocks npm.ps1.

Start `npm run dev`, read its printed URL and open it. Dev-only fault harnesses
below require this server; they are not production build entry points. Use the
browser developer tools to watch Console and Network.

| Time | Action | Expected |
|---|---|---|
| 0–1 min | Open `/`; inspect chart and follow View incidents → inc-001 → Open event evt-003 → View evidence. | Cards 30 / 18 / 3 / 26; two injected ledger effects totaling 200; processing CONFIRMED coexists with business VIOLATION. |
| 1–2 min | Open Events; search `ORDER-PAID-1003`; change Application/status; clear; switch page buttons. | Literal case-insensitive search, combined filters, ten rows per full page, exact Showing range and disabled end buttons. |
| 2–3 min | Open Applications; try whitespace, then create a DEVELOPMENT app. Visit Events and Rules application choices. | Invalid name creates nothing; trimmed valid name appears in the directory and both selectors, with empty events/rules. |
| 3–4 min | On Rules select app-001; disable rule-002; revisit evt-003. | Desired enabled state persists across navigation; evaluations and +200 evidence are unchanged. |
| 4–5 min | Open inc-001; Start investigation, then Resolve incident; return to Overview and event evidence. | Revisions 0 → 1 → 2; history gains exactly two rows; open count becomes 2; +200 and VIOLATION remain. |
| 5–6 min | Paste 500 emoji into a fresh incident note and save; in a fresh case try 501. | 500 Unicode code points are retained in history; 501 are rejected without a write. Full reload resets the case when another fresh case is needed. |
| 6–7 min | Reload the browser; visit `/events/missing-id`, `/incidents/missing-id` and `/non-existent-route`. | Original two apps, enabled rules and open count 3 return; resource Not Found and page 404 have working navigation. |
| 7–8 min | Open `/tests/ui/harness.html?page=overview&mode=slow`, then `mode=empty`, then `mode=error` and Retry. | Loading, successful empty and request failure are distinct; Retry recovers. |
| 8–9 min | Open `/tests/ui/configuration-harness.html?page=applications&mode=lost-ack`; create once; Reload applications. | Uncertain outcome blocks another submit; the read reveals the committed app; no POST is retried automatically. |
| 9–10 min | Set viewport 390 × 844; use Tab/Enter to open navigation and Escape to close; inspect a wide table. | Focus returns to trigger; document has no horizontal overflow, table scroll stays contained; no unexpected console errors or failed asset requests. |

A quick manual pass samples behavior. The automated incident suite additionally
checks invalid transitions, real stale versions, competing writes and lost PATCH
acknowledgements; the other suites exercise error/empty/loading states on all
screens, HTTP response doubles and reconciliation failures. Response doubles are
not integration with a running Backend. No lag=0 claim can establish business
correctness: this mock frontend has no live lag metric or Kafka connection.

For built-route verification by hand, run `npm run preview` after build and use its
printed URL. Open all seven routes directly, plus `/non-existent-route`. An HTTP
200 from SPA fallback counts only as transport success: the page must visibly
render its application 404 and a working return link.
