import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createMockMonitorApi } from "../src/services/mockMonitorApi.ts";
import { MonitorApiError } from "../src/services/apiErrors.ts";

const { chromium } = await import(
  process.env.ERM_PLAYWRIGHT_MODULE ?? "playwright"
);
const root = fileURLToPath(new URL("..", import.meta.url));
const output = process.env.ERM_UI_OUTPUT
  ? resolve(process.env.ERM_UI_OUTPUT)
  : null;
if (output) await mkdir(output, { recursive: true });
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 0 },
  optimizeDeps: { include: ["ajv-formats", "ajv/dist/2020.js", "recharts"] },
});
await server.listen();
const address = server.httpServer.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
const checks = [],
  errors = [],
  requests = [];
let browser, page;
const check = async (name, run) => {
  await run();
  checks.push(name);
};
async function wait(predicate, message) {
  for (let i = 0; i < 120; i++) {
    if (await predicate()) return;
    await new Promise((done) => setTimeout(done, 50));
  }
  assert.fail(message);
}
const go = async (path) => page.goto(base + path);
const harness = async (params = "") =>
  go(`/tests/ui/incidents-harness.html?${params}`);
const listLoaded = () =>
  page
    .getByRole("navigation", { name: "Incidents pagination", exact: true })
    .waitFor();
const detailLoaded = () =>
  page
    .getByRole("heading", { name: "Investigation history", exact: true })
    .waitFor();
const statusFilter = () => page.getByLabel("Incident status", { exact: true });
const severityFilter = () => page.getByLabel("Severity", { exact: true });
const pagination = () =>
  page.getByRole("navigation", { name: "Incidents pagination", exact: true });
const pageText = async (text) =>
  wait(
    async () => (await pagination().innerText()).includes(text),
    `Missing pagination ${text}`,
  );
const version = () => page.getByTestId("incident-version");
const revision = async (value) =>
  wait(
    async () => (await version().innerText()) === value,
    `Missing incident revision ${value}`,
  );
const snapshot = () => page.evaluate(() => window.ermIncidentTest.detail());
const historyCount = () => page.locator("#incident-history tbody tr").count();
const mutationCount = () =>
  page.evaluate(() => window.ermIncidentTest.mutations.length);
const save = async (button, expectedRevision) => {
  await page.getByRole("button", { name: button, exact: true }).click();
  await revision(expectedRevision);
};
const shot = async (name) => {
  if (output)
    await page.screenshot({ path: resolve(output, name), fullPage: true });
};
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.ERM_BROWSER_EXECUTABLE || undefined,
    args: JSON.parse(process.env.ERM_BROWSER_ARGS ?? "[]"),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/"))
      requests.push(request.method() + " " + request.url());
  });
  await check(
    "Incidents loads five cases with two records on the first page",
    async () => {
      await go("/incidents");
      await listLoaded();
      assert.equal(await page.locator("tbody tr").count(), 2);
      await pageText("5 incidents · Page 1 of 3");
      assert.deepEqual(
        await page.locator("tbody tr td:first-child a").allTextContents(),
        ["inc-001", "inc-003"],
      );
    },
  );
  await check(
    "Pagination actually changes records and terminates at the last page",
    async () => {
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await pageText("Page 2 of 3");
      assert.deepEqual(
        await page.locator("tbody tr td:first-child a").allTextContents(),
        ["inc-002", "inc-005"],
      );
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await pageText("Page 3 of 3");
      assert.equal(await page.locator("tbody tr").count(), 1);
      assert.ok(
        await page
          .getByRole("button", { name: "Next", exact: true })
          .isDisabled(),
      );
    },
  );
  await check(
    "Status change resets page; status and severity combine using AND",
    async () => {
      await statusFilter().selectOption("OPEN");
      await pageText("2 incidents · Page 1 of 1");
      await severityFilter().selectOption("HIGH");
      await pageText("1 incidents · Page 1 of 1");
      assert.equal(
        await page.locator("tbody tr td:first-child a").innerText(),
        "inc-001",
      );
      await statusFilter().selectOption("RESOLVED");
      await pageText("1 incidents · Page 1 of 1");
      assert.equal(
        await page.locator("tbody tr td:first-child a").innerText(),
        "inc-004",
      );
      await severityFilter().selectOption("MEDIUM");
      await statusFilter().selectOption("INVESTIGATING");
      await page
        .getByRole("heading", { name: "No matching incidents", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Clear filters", exact: true })
        .first()
        .click();
      await pageText("5 incidents · Page 1 of 3");
      await shot("4B-incidents-desktop.png");
    },
  );
  await check(
    "List event links use observed ID; incident links use incident ID",
    async () => {
      assert.ok(
        (
          await page
            .getByRole("link", { name: "order-paid-1003", exact: true })
            .getAttribute("href")
        ).endsWith("/events/evt-003"),
      );
      await page.getByRole("link", { name: "inc-001", exact: true }).click();
      await detailLoaded();
      assert.equal(new URL(page.url()).pathname, "/incidents/inc-001");
      await revision("0");
    },
  );
  const initialHistory = await historyCount();
  await check(
    "Detail renders primary rule, case-linked violations and +200 sandbox evidence",
    async () => {
      assert.match(
        await page.locator("#incident-title").innerText(),
        /inc-001/,
      );
      assert.match(
        await page.locator(".incident-summary").innerText(),
        /Duplicate/,
      );
      await page.getByText(/rule-002 · DUPLICATE_BUSINESS_EFFECT/).waitFor();
      assert.deepEqual(
        await page
          .locator("#case-evaluations .evaluation-record .status-badge")
          .allTextContents(),
        ["VIOLATION", "VIOLATION"],
      );
      assert.equal(await page.locator(".ledger-snapshot tbody tr").count(), 2);
      await page
        .getByText("Sandbox injected faulty ledger", { exact: true })
        .waitFor();
      await shot("4B-incident-detail-desktop.png");
    },
  );
  await check(
    "OPEN to INVESTIGATING uses revision 0 and appends one server history row",
    async () => {
      await page
        .getByLabel("Investigation note (optional)")
        .fill("Reviewed duplicate effects");
      assert.equal(
        await page
          .getByRole("button", { name: "Resolve incident", exact: true })
          .count(),
        0,
      );
      await save("Start investigation", "1");
      await page
        .getByText("Incident saved as INVESTIGATING · revision 1.", {
          exact: true,
        })
        .waitFor();
      assert.equal(await historyCount(), initialHistory + 1);
      await page
        .getByText("Reviewed duplicate effects", { exact: true })
        .waitFor();
    },
  );
  await check(
    "Shared list and Overview reflect INVESTIGATING without reducing open count",
    async () => {
      await page
        .getByRole("link", { name: "Back to Incidents", exact: true })
        .click();
      await listLoaded();
      assert.match(
        await page.locator("tbody tr").first().innerText(),
        /INVESTIGATING/,
      );
      await page.getByRole("link", { name: "Overview", exact: true }).click();
      await wait(
        async () =>
          (await page.locator(".stat-value").allTextContents()).join() ===
          "30,18,3,26",
        "Incorrect overview after first transition",
      );
      await page.getByRole("link", { name: "inc-001", exact: true }).click();
      await detailLoaded();
      await revision("1");
    },
  );
  await check(
    "INVESTIGATING to RESOLVED uses returned revision and keeps full history",
    async () => {
      await page
        .getByLabel("Investigation note (optional)")
        .fill("Investigation complete; ledger unchanged");
      await save("Resolve incident", "2");
      assert.equal(await historyCount(), initialHistory + 2);
      assert.equal(
        await page
          .getByRole("button", { name: "Start investigation", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Resolve incident", exact: true })
          .count(),
        0,
      );
      assert.equal(await page.locator(".ledger-snapshot tbody tr").count(), 2);
      assert.deepEqual(
        await page
          .locator("#case-evaluations .evaluation-record .status-badge")
          .allTextContents(),
        ["VIOLATION", "VIOLATION"],
      );
    },
  );
  await check(
    "Resolved list remains visible and Overview changes only open count to two",
    async () => {
      await page
        .getByRole("link", { name: "Back to Incidents", exact: true })
        .click();
      await listLoaded();
      assert.match(
        await page.locator("tbody tr").first().innerText(),
        /RESOLVED/,
      );
      await page.getByRole("link", { name: "Overview", exact: true }).click();
      await wait(
        async () =>
          (await page.locator(".stat-value").allTextContents()).join() ===
          "30,18,2,26",
        "Incorrect overview after resolution",
      );
    },
  );
  await check(
    "Overview to incident to event to evidence takes three navigation actions",
    async () => {
      await page.getByRole("link", { name: "inc-001", exact: true }).click();
      await detailLoaded();
      await page
        .getByRole("link", { name: "Open event evt-003", exact: false })
        .click();
      // Incident and event screens both have Business evidence. Wait for the
      // destination identity so retained incident content cannot satisfy readiness.
      await page
        .getByRole("heading", { name: "Event detail", exact: true })
        .waitFor();
      await page
        .getByRole("heading", { name: "Business evidence", exact: true })
        .waitFor();
      await page
        .getByRole("link", { name: "View evidence", exact: true })
        .click();
      assert.equal(new URL(page.url()).hash, "#evidence");
      assert.equal(await page.locator(".ledger-snapshot tbody tr").count(), 2);
    },
  );
  await check(
    "Full reload resets shared mock mutation and Overview to 30/18/3/26",
    async () => {
      await page.reload();
      await page
        .getByRole("heading", { name: "Business evidence", exact: true })
        .waitFor();
      await page.getByRole("link", { name: "Overview", exact: true }).click();
      await wait(
        async () =>
          (await page.locator(".stat-value").allTextContents()).join() ===
          "30,18,3,26",
        "Reload did not reset mock state",
      );
      await page.getByRole("link", { name: "inc-001", exact: true }).click();
      await detailLoaded();
      await revision("0");
      assert.equal(await historyCount(), initialHistory);
    },
  );
  await check(
    "Timeout case report references open Event Detail rather than dead local anchors",
    async () => {
      await go("/incidents/inc-003");
      await detailLoaded();
      const link = page.getByRole("link", {
        name: "rpt-007-1 (event detail)",
        exact: true,
      });
      assert.equal(await link.getAttribute("href"), "/events/evt-007");
      await link.click();
      await page
        .getByRole("heading", { name: "rpt-007-1", exact: true })
        .waitFor();
    },
  );
  await check(
    "Missing incident gets distinct Not Found with working return link",
    async () => {
      await go("/incidents/missing-id");
      await page
        .getByRole("heading", { name: "Incident Not Found", exact: true })
        .waitFor();
      await page
        .getByRole("link", { name: "Return to Incidents", exact: true })
        .click();
      await listLoaded();
    },
  );
  for (const target of ["list", "detail"]) {
    await check(`${target} loading renders pending state`, async () => {
      await harness(`page=${target}&mode=slow`);
      await page.getByRole("status").first().waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
    });
    await check(
      `${target} read error Retry calls API and recovers`,
      async () => {
        await harness(`page=${target}&mode=error`);
        await page.getByRole("alert").waitFor();
        await page.getByRole("button", { name: "Retry", exact: true }).click();
        if (target === "list") await listLoaded();
        else await detailLoaded();
      },
    );
  }
  await check(
    "Successful empty incident dataset is distinct from filter no-match",
    async () => {
      await harness("page=list&mode=empty");
      await page
        .getByRole("heading", { name: "No incidents recorded", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("heading", { name: "No matching incidents", exact: true })
          .count(),
        0,
      );
    },
  );
  await check(
    "List Retry retains filters and does not show stale rows as a successful response",
    async () => {
      await harness("page=list");
      await listLoaded();
      await statusFilter().selectOption("OPEN");
      await pageText("2 incidents");
      await page.evaluate(() =>
        window.ermIncidentTest.controls.failNext(
          "listIncidents",
          "SERVICE_UNAVAILABLE",
        ),
      );
      await severityFilter().selectOption("HIGH");
      await page.getByRole("alert").waitFor();
      assert.equal(await page.locator("tbody tr").count(), 0);
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await pageText("1 incidents");
      assert.equal(await statusFilter().inputValue(), "OPEN");
      assert.equal(await severityFilter().inputValue(), "HIGH");
    },
  );
  await check(
    "Late status-filter result cannot replace newer results",
    async () => {
      await harness("page=list&mode=race");
      await listLoaded();
      await statusFilter().selectOption("OPEN");
      await wait(
        () =>
          page.evaluate(() =>
            window.ermIncidentTest.queries.some(
              (query) => query.status === "OPEN",
            ),
          ),
        "Old query did not start",
      );
      await statusFilter().selectOption("RESOLVED");
      await pageText("2 incidents");
      await new Promise((done) => setTimeout(done, 800));
      assert.deepEqual(
        await page.locator("tbody tr td:first-child a").allTextContents(),
        ["inc-005", "inc-004"],
      );
    },
  );
  await check(
    "Page invalidated by dataset shrink re-queries a valid page",
    async () => {
      await harness("page=list&mode=page-shrink");
      await listLoaded();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page
        .getByRole("heading", { name: "No incidents recorded", exact: true })
        .waitFor();
      assert.deepEqual(
        await page.evaluate(() =>
          window.ermIncidentTest.queries.map((query) => query.page),
        ),
        [0, 1, 0],
      );
    },
  );
  await check(
    "Pending submission prevents two simultaneous form submissions",
    async () => {
      await harness("mode=slow");
      await detailLoaded();
      await page.locator(".incident-transition-form").evaluate((form) => {
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      });
      await page
        .getByRole("button", { name: "Saving change…", exact: true })
        .waitFor();
      assert.ok(
        await page
          .getByRole("button", { name: "Saving change…", exact: true })
          .isDisabled(),
      );
      await revision("1");
      assert.equal(await mutationCount(), 1);
      assert.equal((await snapshot()).history.length, initialHistory + 1);
    },
  );
  await check(
    "Real stale-version conflict blocks writes until explicit reload; PATCH not retried",
    async () => {
      await harness("mode=conflict");
      await detailLoaded();
      await page
        .getByRole("button", { name: "Start investigation", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: "Incident changed elsewhere",
          exact: true,
        })
        .waitFor();
      await revision("0");
      assert.equal(await mutationCount(), 1);
      assert.ok(
        await page
          .getByRole("button", { name: "Start investigation", exact: true })
          .isDisabled(),
      );
      assert.equal((await snapshot()).version, "1");
      await page
        .getByRole("button", { name: "Reload detail", exact: true })
        .click();
      await detailLoaded();
      await revision("1");
      assert.equal(await mutationCount(), 1);
    },
  );
  for (const [mode, title] of [
    ["invalid-transition", "Transition not allowed"],
    ["mutation-error", "Could not update incident"],
  ])
    await check(
      `${mode} keeps old status/history and requires read reconciliation`,
      async () => {
        await harness(`mode=${mode}`);
        await detailLoaded();
        const before = await snapshot();
        await page
          .getByRole("button", { name: "Start investigation", exact: true })
          .click();
        await page.getByRole("heading", { name: title, exact: true }).waitFor();
        await revision("0");
        assert.deepEqual(await snapshot(), before);
        assert.equal(await mutationCount(), 1);
        await page
          .getByRole("button", { name: "Reload detail", exact: true })
          .click();
        await detailLoaded();
        await revision("0");
        assert.equal(await mutationCount(), 1);
      },
    );
  await check(
    "Lost acknowledgement after a real commit never triggers automatic PATCH retry",
    async () => {
      await harness("mode=lost-ack");
      await detailLoaded();
      await page
        .getByRole("button", { name: "Start investigation", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: "Update outcome is uncertain",
          exact: true,
        })
        .waitFor();
      await revision("0");
      assert.equal((await snapshot()).version, "1");
      assert.equal(await mutationCount(), 1);
      await page
        .getByRole("button", { name: "Reload detail", exact: true })
        .click();
      await detailLoaded();
      await revision("1");
      assert.equal(await historyCount(), initialHistory + 1);
      assert.equal(await mutationCount(), 1);
    },
  );
  await check("Mock incident pages make no Backend HTTP requests", async () => {
    assert.deepEqual(requests, []);
  });
  const transport = createMockMonitorApi({ latencyMs: 0 }).api;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    try {
      let value;
      if (request.method() === "PATCH")
        value = await transport.updateIncidentStatus(
          "inc-001",
          request.postDataJSON(),
        );
      else if (url.pathname.endsWith("/incidents/inc-001"))
        value = await transport.getIncidentDetail("inc-001");
      else value = await transport.listIncidents({ page: 0, size: 2 });
      await route.fulfill({ status: 200, json: value });
    } catch (error) {
      if (!(error instanceof MonitorApiError)) throw error;
      await route.fulfill({ status: error.status, json: error.response });
    }
  });
  await check(
    "Incident Detail and mutation also work through HTTP adapter response doubles",
    async () => {
      await harness("mode=http");
      await detailLoaded();
      await save("Start investigation", "1");
      assert.equal(await historyCount(), initialHistory + 1);
    },
  );
  await page.unroute("**/api/v1/**");
  await check(
    "Malformed HTTP404 is a protocol error rather than Incident Not Found",
    async () => {
      await page.route("**/api/v1/**", (route) =>
        route.fulfill({ status: 404, body: "not JSON" }),
      );
      await harness("mode=http");
      await page.getByRole("alert").waitFor();
      assert.equal(
        await page
          .getByRole("heading", { name: "Incident Not Found", exact: true })
          .count(),
        0,
      );
      await page.unroute("**/api/v1/**");
    },
  );
  for (const width of [390, 768])
    for (const path of ["/incidents", "/incidents/inc-001"])
      await check(`Responsive ${width}px ${path}`, async () => {
        await page.setViewportSize({ width, height: 844 });
        await go(path);
        if (path === "/incidents") await listLoaded();
        else await detailLoaded();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          "Document overflow",
        );
        if (width === 390)
          await shot(
            path === "/incidents"
              ? "4B-incidents-mobile.png"
              : "4B-incident-detail-mobile.png",
          );
      });
  await check(
    "Keyboard focus reaches mutation action and mobile navigation remains usable",
    async () => {
      await page.getByLabel("Investigation note (optional)").focus();
      await page.keyboard.press("Tab");
      assert.ok(
        await page
          .getByRole("button", { name: "Start investigation", exact: true })
          .evaluate((button) => document.activeElement === button),
      );
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Navigation", exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .getByRole("dialog", { name: "Navigation", exact: true })
          .isVisible(),
        false,
      );
    },
  );
  await check(
    "Investigation note preserves 500 Unicode code points through real text input and history",
    async () => {
      await harness();
      await detailLoaded();
      const note = page.getByLabel("Investigation note (optional)", { exact: true });
      await note.focus();
      const value = "😀".repeat(500);
      await page.keyboard.insertText(value);
      assert.equal(await note.inputValue(), value);
      await save("Start investigation", "1");
      const updated = await snapshot();
      assert.equal(updated.history.at(-1).note, value);
      assert.equal(await mutationCount(), 1);
    },
  );
  await check(
    "Investigation note rejects 501 Unicode code points before mutation and permits correction",
    async () => {
      await harness();
      await detailLoaded();
      const note = page.getByLabel("Investigation note (optional)", { exact: true });
      await note.focus();
      await page.keyboard.insertText("😀".repeat(501));
      await page.getByRole("button", { name: "Start investigation", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "at most 500 characters" }).waitFor();
      assert.equal(await mutationCount(), 0);
      assert.equal((await snapshot()).version, "0");
      assert.equal(Array.from(await note.inputValue()).length, 501);
      await note.fill("Corrected note");
      await save("Start investigation", "1");
      assert.equal((await snapshot()).history.at(-1).note, "Corrected note");
      assert.equal(await mutationCount(), 1);
    },
  );
  await check("No uncaught browser errors", async () => {
    assert.deepEqual(errors, []);
  });
  if (output)
    await writeFile(
      resolve(output, "4B-browser-results.json"),
      JSON.stringify(
        {
          status: "TESTED",
          browser: browser.version(),
          checks,
          checkCount: checks.length,
          errors,
          requests,
          note: "HTTP requests after the mock assertion are intercepted response doubles, not Spring Boot.",
        },
        null,
        2,
      ),
    );
  console.log(
    JSON.stringify({ status: "TESTED", checks: checks.length, errors }),
  );
} catch (error) {
  if (output && page) {
    await shot("4B-browser-failure.png");
    await writeFile(
      resolve(output, "4B-browser-failure.json"),
      JSON.stringify(
        { passedChecks: checks, error: String(error), errors },
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
