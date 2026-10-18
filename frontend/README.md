# ERM Dashboard

React + TypeScript + Vite dashboard with a Dark Emerald application shell. Pages are placeholders: no mock dataset, API adapter or live monitoring is connected yet. Unavailable metrics use a dash, not zero; detail URLs show the requested ID without assuming a record exists.

## Requirements and commands

Use Node.js 22.12+ on the 22.x line, or Node.js 24+, with npm 10+. Install from the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. For reproducible installs after checkout, `npm ci` uses the committed lockfile.

```bash
npm run build
npm run lint
npm run preview
```

Build runs TypeScript checking and writes static files to `dist/`. Lint uses Oxlint from the Vite template. Preview serves a completed build locally; it is not a production server. A static deployment must rewrite client routes to `index.html` so direct detail URLs work.

## Routes

| Path             | Page                                |
| ---------------- | ----------------------------------- |
| `/`              | Overview                            |
| `/applications`  | Applications                        |
| `/events`        | Event Explorer                      |
| `/events/:id`    | Event detail; observation record ID |
| `/rules`         | Monitoring Rules                    |
| `/incidents`     | Incidents                           |
| `/incidents/:id` | Incident detail                     |
| `*`              | 404 with a link to Overview         |

The sidebar has five main destinations. Detail pages return to their parent list. On narrow screens, the navigation button opens a modal drawer; close it with the close button, Escape or navigation. The drawer closes when switching to a desktop viewport.

## Structure

- `src/app/`: router and shared application shell.
- `src/components/layout/`: sidebar and header.
- `src/components/ui/`: presentation components, table shell and loading/empty/error states.
- `src/pages/`: eight route components.
- `src/styles/`: color, spacing and layout tokens plus responsive CSS.

`StatusBadge` takes a display label and semantic tone independently; business status mappings belong in the later data integration. `DataTable` accepts typed column definitions and composable row content, with a caller-provided state when no rows are supplied. It does not invent sorting or pagination. `StatCard` distinguishes unavailable values (`null`) from zero and provides a real loading presentation when requested.

Recharts is installed for the later dashboard charts and is not imported by the placeholder interface. Business DTO types, fixtures, adapters, search, forms, rule toggles and incident mutations remain unimplemented. Demo state will be session-only and reset on reload once integrated, as defined in the [Mock Data Spec](../docs/07-mock-data-spec.md).
