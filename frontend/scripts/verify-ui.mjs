import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createMockMonitorApi } from "../src/services/mockMonitorApi.ts";

// Optional tooling: npm install --no-save --package-lock=false playwright
// Then npx playwright install chromium. No test framework is added to the app.
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
let browser;
const checks = [],
  errors = [],
  backendRequests = [];
let page;
async function check(name, action) {
  await action();
  checks.push(name);
}
const expectText = async (locator, value) => {
  await locator.filter({ hasText: value }).first().waitFor();
};
const wait = async (condition, message) => {
  for (let count = 0; count < 100; count++) {
    if (await condition()) return;
    await new Promise((done) => setTimeout(done, 50));
  }
  assert.fail(message);
};
const go = async (path) => {
  await page.goto(base + path);
};
const harness = async (query) => go(`/tests/ui/harness.html?${query}`);
const loadedEvents = async () =>
  page.getByRole("navigation", { name: "Events pagination" }).waitFor();
const loadedDetail = async () =>
  page
    .getByRole("heading", { name: "Business evidence", exact: true })
    .waitFor();
async function screenshot(name) {
  if (output)
    await page.screenshot({ path: resolve(output, name), fullPage: true });
}
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
    if (request.url().includes("/api/v1/")) backendRequests.push(request.url());
  });
  await check(
    "Overview cards use adapter values 30/18/3/26 and reference snapshot",
    async () => {
      await go("/");
      await expectText(page.locator(".stat-value").first(), "30");
      assert.deepEqual(await page.locator(".stat-value").allTextContents(), [
        "30",
        "18",
        "3",
        "26",
      ]);
      await page.getByText(/As of 2026-10-17 10:10:00 UTC/).waitFor();
    },
  );
  await check(
    "Responsive Recharts chart, exact buckets sum to 30, partial boundaries labelled",
    async () => {
      await page.locator(".recharts-area").waitFor();
      await page.getByText("View exact UTC bucket counts").click();
      const cells = await page
        .locator(".chart-data tbody tr td:nth-child(3)")
        .allTextContents();
      assert.equal(cells.length, 25);
      assert.equal(
        cells.reduce((sum, item) => sum + Number(item), 0),
        30,
      );
      assert.equal(
        await page
          .locator(".chart-data tbody tr")
          .filter({ hasText: "Partial" })
          .count(),
        2,
      );
      await page.getByText("View exact UTC bucket counts").click();
      await screenshot("4A-overview-desktop.png");
    },
  );
  await check(
    "Latest incident navigates to existing scaffold, outside 4B",
    async () => {
      await page.getByRole("link", { name: "inc-001", exact: true }).click();
      assert.equal(new URL(page.url()).pathname, "/incidents/inc-001");
      await page
        .getByRole("heading", { name: "Incident detail", exact: true })
        .waitFor();
    },
  );
  await go("/events");
  await loadedEvents();
  const search = () =>
    page.getByRole("searchbox", { name: "Logical event ID" });
  const pagination = () =>
    page.getByRole("navigation", { name: "Events pagination" });
  await check("Events first page has ten records from 30", async () => {
    assert.equal(await page.locator("tbody tr").count(), 10);
    assert.match(await pagination().innerText(), /30 events.*Page 1 of 3/);
  });
  await check(
    "Next page changes records, preserves server pagination metadata",
    async () => {
      const before = await page.locator("tbody tr").first().innerText();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expectText(pagination(), "Page 2 of 3");
      assert.notEqual(
        await page.locator("tbody tr").first().innerText(),
        before,
      );
    },
  );
  await check(
    "Search trims and ignores case; changing search resets page",
    async () => {
      await search().fill("  ORDER-PAID-1003  ");
      await expectText(pagination(), "1 events · Page 1 of 1");
      assert.equal(await page.locator("tbody tr").count(), 1);
      await page
        .getByRole("link", { name: "order-paid-1003", exact: true })
        .waitFor();
    },
  );
  await check(
    "Application and processing filters combine with search using AND",
    async () => {
      await page
        .getByLabel("Application", { exact: true })
        .selectOption("app-002");
      await page
        .getByRole("heading", { name: "No matching events", exact: true })
        .waitFor();
      await page
        .getByLabel("Application", { exact: true })
        .selectOption("app-001");
      await page
        .getByLabel("Processing status", { exact: true })
        .selectOption("UNKNOWN");
      await page
        .getByRole("heading", { name: "No matching events", exact: true })
        .waitFor();
      await search().fill("");
      await expectText(pagination(), "5 events · Page 1 of 1");
      const rows = await page.locator("tbody tr").allTextContents();
      assert.equal(rows.length, 5);
      assert.ok(
        rows.every(
          (row) => row.includes("Loyalty Sandbox") && row.includes("UNKNOWN"),
        ),
      );
    },
  );
  await check(
    "Clear restores dataset and first page; app change also resets page",
    async () => {
      await page
        .getByRole("button", { name: "Clear filters", exact: true })
        .first()
        .click();
      await expectText(pagination(), "30 events · Page 1 of 3");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expectText(pagination(), "Page 2 of 3");
      await page
        .getByLabel("Application", { exact: true })
        .selectOption("app-001");
      await expectText(pagination(), "15 events · Page 1 of 2");
      await screenshot("4A-events-desktop.png");
    },
  );
  await check("Event links use observed ID, not logical ID", async () => {
    await search().fill("order-paid-1003");
    await expectText(pagination(), "1 events");
    await page
      .getByRole("link", { name: "order-paid-1003", exact: true })
      .click();
    assert.equal(new URL(page.url()).pathname, "/events/evt-003");
    await loadedDetail();
  });
  for (const [id, attempts, effects, outcomes] of [
    ["evt-001", 1, 1, ["PASS", "PASS", "PASS"]],
    ["evt-002", 2, 1, ["PASS", "PASS", "PASS"]],
    ["evt-003", 1, 2, ["PASS", "VIOLATION", "VIOLATION"]],
    ["evt-004", 0, 0, ["UNKNOWN", "UNKNOWN", "UNKNOWN"]],
    ["evt-005", 0, 1, ["UNKNOWN", "PASS", "PASS"]],
  ])
    await check(
      `Scenario ${id}: reported attempts, visible effects and latest outcomes`,
      async () => {
        await go(`/events/${id}`);
        await loadedDetail();
        assert.equal(await page.locator(".attempt-item").count(), attempts);
        assert.equal(
          await page.locator(".ledger-snapshot tbody tr").count(),
          effects,
        );
        assert.deepEqual(
          await page
            .locator(
              "#evaluations > .panel-body > .evaluation-grid .status-badge",
            )
            .allTextContents(),
          outcomes,
        );
        if (attempts === 0) {
          await page
            .getByRole("heading", {
              name: "No processing reports available",
              exact: true,
            })
            .waitFor();
          assert.match(
            await page.locator("#attempts").innerText(),
            /actual total.*unknown/,
          );
        }
        if (id === "evt-003") {
          await page
            .getByRole("link", { name: "Incident inc-001", exact: false })
            .waitFor();
          await page
            .getByText("Sandbox injected faulty ledger", { exact: true })
            .waitFor();
          assert.match(
            await page.locator(".ledger-snapshot").innerText(),
            /200/,
          );
          await screenshot("4A-event-003-desktop.png");
        }
        if (id === "evt-004") {
          assert.equal(
            await page.getByText("eff-004-1", { exact: true }).count(),
            0,
          );
          await page
            .getByRole("heading", { name: "Evidence gaps", exact: true })
            .waitFor();
          assert.match(
            await page.locator("#evidence").innerText(),
            /not established/,
          );
        }
        if (id === "evt-005") {
          assert.match(
            await page
              .locator("#metadata-title")
              .locator("..")
              .locator("..")
              .innerText(),
            /UNKNOWN/,
          );
          assert.equal(await page.locator(".report-list li").count(), 0);
        }
      },
    );
  await check(
    "Evidence anchor, read-only masked references and provenance are accessible",
    async () => {
      await go("/events/evt-003");
      await loadedDetail();
      await page
        .getByRole("link", { name: "View evidence", exact: true })
        .click();
      assert.equal(new URL(page.url()).hash, "#evidence");
      await page
        .getByRole("link", { name: "ev-003-ledger", exact: true })
        .first()
        .click();
      assert.equal(new URL(page.url()).hash, "#evidence-ev-003-ledger");
      assert.match(
        await page.locator("#evidence-ev-003-ledger").innerText(),
        /COMPLETE[\s\S]*TRUSTED[\s\S]*FINAL/,
      );
      assert.equal(await page.locator("#evidence button").count(), 0);
    },
  );
  await check(
    "Same-attempt conflict preserves both reports and evaluation history",
    async () => {
      await go("/events/evt-010");
      await loadedDetail();
      assert.equal(await page.locator(".attempt-item").count(), 1);
      assert.equal(await page.locator(".report-list > li").count(), 2);
      await page.getByText("CONFLICTED", { exact: true }).first().waitFor();
      await page
        .getByRole("heading", { name: "Historical evaluations", exact: true })
        .waitFor();
      assert.equal(
        await page.locator(".history-evaluations .evaluation-record").count(),
        3,
      );
    },
  );
  await check(
    "Missing event is Not Found, with working return navigation",
    async () => {
      await go("/events/missing-id");
      await page
        .getByRole("heading", { name: "Event Not Found", exact: true })
        .waitFor();
      await page
        .getByRole("link", { name: "Return to Events", exact: true })
        .click();
      await loadedEvents();
    },
  );
  for (const [path, title] of [
    ["/applications", "Applications"],
    ["/rules", "Monitoring Rules"],
    ["/incidents", "Incidents"],
    ["/incidents/inc-001", "Incident detail"],
  ])
    await check(`Scaffold preserved at ${path}`, async () => {
      await go(path);
      await page.getByRole("heading", { name: title, exact: true }).waitFor();
    });
  await check("404 keeps working navigation", async () => {
    await go("/does-not-exist");
    await page
      .getByRole("link", { name: "Back to Overview", exact: true })
      .click();
    await expectText(page.locator(".stat-value").first(), "30");
  });
  for (const target of ["overview", "events", "detail"]) {
    await check(
      `${target} loading is visible while API is pending`,
      async () => {
        await harness(`page=${target}&mode=slow`);
        await page.getByRole("status").first().waitFor();
        assert.equal(await page.locator(".error-state").count(), 0);
      },
    );
    await check(
      `${target} one-shot error and Retry actually call API again`,
      async () => {
        await harness(`page=${target}&mode=error`);
        await page.getByRole("alert").waitFor();
        assert.match(await page.getByRole("alert").innerText(), /503/);
        await page.getByRole("button", { name: "Retry", exact: true }).click();
        if (target === "overview")
          await expectText(page.locator(".stat-value").first(), "30");
        else if (target === "events") await loadedEvents();
        else await loadedDetail();
      },
    );
  }
  await check(
    "Empty Overview is a successful zero snapshot; empty Events has a distinct message",
    async () => {
      await harness("page=overview&mode=empty");
      await page
        .getByRole("heading", {
          name: "No observed events in this window",
          exact: true,
        })
        .waitFor();
      assert.deepEqual(await page.locator(".stat-value").allTextContents(), [
        "0",
        "0",
        "0",
        "0",
      ]);
      await harness("page=events&mode=empty");
      await page
        .getByRole("heading", { name: "No events recorded", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("heading", { name: "No matching events", exact: true })
          .count(),
        0,
      );
    },
  );
  await check(
    "Application-selector failure can retry independently",
    async () => {
      await harness("page=events&mode=app-error");
      await page.getByRole("alert").waitFor();
      await loadedEvents();
      assert.equal(
        await page.getByLabel("Application", { exact: true }).isDisabled(),
        true,
      );
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await wait(
        async () =>
          !(await page.getByLabel("Application", { exact: true }).isDisabled()),
        "Application retry did not recover",
      );
    },
  );
  await check(
    "Filtered request Retry preserves application and processing conditions",
    async () => {
      await harness("page=events");
      await loadedEvents();
      await page
        .getByLabel("Application", { exact: true })
        .selectOption("app-001");
      await expectText(pagination(), "15 events");
      await page.evaluate(() =>
        window.ermUiTest.controls.failNext("listEvents", "SERVICE_UNAVAILABLE"),
      );
      await page
        .getByLabel("Processing status", { exact: true })
        .selectOption("UNKNOWN");
      await page.getByRole("alert").waitFor();
      assert.equal(await page.locator("tbody tr").count(), 0);
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await expectText(pagination(), "5 events");
      assert.equal(
        await page.getByLabel("Application", { exact: true }).inputValue(),
        "app-001",
      );
      assert.equal(
        await page
          .getByLabel("Processing status", { exact: true })
          .inputValue(),
        "UNKNOWN",
      );
    },
  );
  await check(
    "Out-of-order response cannot replace newer search; old request aborted",
    async () => {
      await harness("page=events&mode=race");
      await loadedEvents();
      await search().fill("1003");
      await wait(
        () =>
          page.evaluate(() =>
            window.ermUiTest.calls.some((call) => call.search === "1003"),
          ),
        "First request did not start",
      );
      await search().fill("1005");
      await page
        .getByRole("link", { name: "order-paid-1005", exact: true })
        .waitFor();
      await new Promise((done) => setTimeout(done, 800));
      assert.equal(
        await page
          .getByRole("link", { name: "order-paid-1003", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("link", { name: "order-paid-1005", exact: true })
          .count(),
        1,
      );
      assert.equal(
        await page.evaluate(() =>
          window.ermUiTest.calls.some(
            (call) => call.search === "1003" && call.aborted,
          ),
        ),
        true,
      );
    },
  );
  await check("Mock UI performs no Backend HTTP requests", async () => {
    assert.equal(backendRequests.length, 0);
  });
  const api = createMockMonitorApi({ latencyMs: 0 }).api;
  const overview = await api.getOverview({ applicationId: "app-002" }),
    detail = await api.getEventDetail("evt-005"),
    eventPage = await api.listEvents({ page: 0, size: 10 }),
    applications = await api.listApplications({ size: 100 });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/overview")
      ? overview
      : path.endsWith("/applications")
        ? applications
        : path.endsWith("/events")
          ? eventPage
          : detail;
    await route.fulfill({ status: 200, json: body });
  });
  for (const target of ["overview", "events", "detail"])
    await check(
      `${target} works through HTTP adapter with response doubles`,
      async () => {
        await harness(`page=${target}&mode=http&id=evt-005`);
        if (target === "overview")
          await expectText(page.locator(".stat-value").first(), "15");
        else if (target === "events") await loadedEvents();
        else await loadedDetail();
      },
    );
  await page.unroute("**/api/v1/**");
  await check(
    "HTTP 404 with invalid payload is a protocol error, not Event Not Found",
    async () => {
      await page.route("**/api/v1/**", (route) =>
        route.fulfill({ status: 404, body: "not JSON" }),
      );
      await harness("page=detail&mode=http");
      await page.getByRole("alert").waitFor();
      assert.equal(
        await page
          .getByRole("heading", { name: "Event Not Found", exact: true })
          .count(),
        0,
      );
      await page.unroute("**/api/v1/**");
    },
  );
  for (const width of [390, 768])
    for (const path of ["/", "/events", "/events/evt-003"])
      await check(`Responsive layout ${width}px ${path}`, async () => {
        await page.setViewportSize({ width, height: 844 });
        await go(path);
        if (path === "/")
          await expectText(page.locator(".stat-value").first(), "30");
        else if (path === "/events") await loadedEvents();
        else await loadedDetail();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          "Document overflows horizontally",
        );
        if (width === 390)
          await screenshot(
            `4A-${path === "/" ? "overview" : path === "/events" ? "events" : "event-detail"}-mobile.png`,
          );
      });
  await check(
    "Mobile menu Escape, labelled fields and keyboard focus",
    async () => {
      await go("/events");
      await loadedEvents();
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
      await search().focus();
      await page.keyboard.press("Tab");
      assert.equal(
        await page
          .getByLabel("Application", { exact: true })
          .evaluate((element) => document.activeElement === element),
        true,
      );
    },
  );
  await check("No uncaught browser errors", async () => {
    assert.deepEqual(errors, []);
  });
  const result = {
    status: "TESTED",
    browser: browser.version(),
    checks,
    checkCount: checks.length,
    errors,
    backendRequests,
    note: "HTTP requests after mock assertion are intercepted response doubles, not a real Backend.",
  };
  if (output)
    await writeFile(
      resolve(output, "4A-browser-results.json"),
      JSON.stringify(result, null, 2),
    );
  console.log(
    JSON.stringify({ status: "TESTED", checks: checks.length, errors }),
  );
} catch (error) {
  if (output && page) {
    await screenshot("4A-browser-failure.png");
    await writeFile(
      resolve(output, "4A-browser-failure.json"),
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
