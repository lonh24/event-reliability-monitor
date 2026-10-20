import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

// Exercise only the built application: no source imports, harness or HTTP doubles.
// Run npm run build first; optional Playwright setup matches the other UI runners.
const { chromium } = await import(process.env.ERM_PLAYWRIGHT_MODULE ?? "playwright");
const output = process.env.ERM_UI_OUTPUT ? resolve(process.env.ERM_UI_OUTPUT) : null;
if (output) await mkdir(output, { recursive: true });
const server = await preview({
  root: fileURLToPath(new URL("..", import.meta.url)),
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const address = server.httpServer.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
const checks = [], pageErrors = [], consoleErrors = [], failedRequests = [];
const failedResponses = [], apiRequests = [], assets = new Set();
let browser, page, failure;
const check = async (name, run) => {
  await run();
  checks.push(name);
  console.log(`PASS ${checks.length}: ${name}`);
};
const text = async (locator, expected) => {
  await locator.filter({ hasText: expected }).first().waitFor();
};
const ready = async (path) => {
  if (path === "/") {
    await text(page.locator(".stat-value").first(), "30");
    await page.locator(".recharts-area").waitFor();
  } else if (path === "/applications") {
    await page.getByText(/applications · All records/).waitFor();
  } else if (path === "/events" || path === "/rules" || path === "/incidents") {
    const name = path === "/events" ? "Events" : path === "/rules" ? "Rules" : "Incidents";
    await page.getByRole("navigation", { name: `${name} pagination`, exact: true }).waitFor();
  } else if (path.startsWith("/events/")) {
    await page.getByRole("heading", { name: "Event detail", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Business evidence", exact: true }).waitFor();
  } else if (path.startsWith("/incidents/")) {
    await page.getByRole("heading", { name: "Investigation history", exact: true }).waitFor();
  }
};
const navigate = async (name, path) => {
  await page.getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name, exact: true }).click();
  await ready(path);
};
const evidence = () => page.locator("#evidence-ev-003-ledger");
const stats = () => page.locator(".stat-value").allTextContents();
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.ERM_BROWSER_EXECUTABLE || undefined,
    args: JSON.parse(process.env.ERM_BROWSER_ARGS ?? "[]"),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/v1")) apiRequests.push(request.url()); });
  page.on("response", response => {
    const path = new URL(response.url()).pathname;
    if (response.status() >= 400) failedResponses.push({ path, status: response.status() });
    if (path.startsWith("/assets/")) assets.add(path);
  });
  for (const [path, heading] of [
    ["/", "Overview"], ["/applications", "Applications"], ["/events", "Event Explorer"],
    ["/events/evt-003", "Event detail"], ["/rules", "Monitoring Rules"],
    ["/incidents", "Incidents"], ["/incidents/inc-001", "Incident detail"],
  ]) {
    await check(`Built route loads directly: ${path}`, async () => {
      const response = await page.goto(base + path);
      assert.equal(response.status(), 200);
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      await ready(path);
      assert.equal(await page.locator('script[type="module"][src^="/assets/"]').count(), 1);
    });
  }
  await check("SPA fallback renders application 404 and its return link works", async () => {
    const response = await page.goto(base + "/non-existent-route");
    assert.equal(response.status(), 200); // Transport fallback alone is insufficient.
    await page.getByRole("heading", { name: "Page not found", exact: true }).waitFor();
    await page.getByRole("heading", { name: "404 · This page does not exist", exact: true }).waitFor();
    await page.getByRole("link", { name: "Back to Overview", exact: true }).click();
    await ready("/");
    assert.deepEqual(await stats(), ["30", "18", "3", "26"]);
  });
  for (const [path, heading] of [["/events/missing-id", "Event Not Found"], ["/incidents/missing-id", "Incident Not Found"]]) {
    await check(`Built resource Not Found is distinct: ${path}`, async () => {
      await page.goto(base + path);
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    });
  }
  let originalLedger, originalEvaluations;
  await check("Built investigation flow reaches read-only duplicate evidence", async () => {
    await page.goto(base + "/"); await ready("/");
    await page.getByRole("link", { name: "View incidents", exact: true }).click(); await ready("/incidents");
    await page.getByRole("link", { name: "inc-001", exact: true }).click(); await ready("/incidents/inc-001");
    await page.getByRole("link", { name: "Open event evt-003", exact: false }).click(); await ready("/events/evt-003");
    await page.getByRole("link", { name: "View evidence", exact: true }).click();
    assert.equal(new URL(page.url()).hash, "#evidence");
    assert.equal(await evidence().locator("tbody tr").count(), 2);
    assert.match(await evidence().innerText(), /200/);
    assert.match(await evidence().innerText(), /Sandbox injected faulty ledger/);
    originalLedger = await evidence().innerText();
    originalEvaluations = await page.locator("#evaluations").innerText();
  });
  await check("Built rule mutation survives navigation without rewriting evidence", async () => {
    await navigate("Monitoring Rules", "/rules");
    await page.getByLabel("Application", { exact: true }).selectOption("app-001");
    const row = page.locator('tr[data-rule-id="rule-002"]');
    await row.getByRole("button", { name: /^Disable / }).click();
    await row.getByRole("button", { name: /^Enable / }).waitFor();
    await row.getByRole("link", { name: "evt-003", exact: true }).click(); await ready("/events/evt-003");
    assert.equal(await evidence().innerText(), originalLedger);
    assert.equal(await page.locator("#evaluations").innerText(), originalEvaluations);
  });
  await check("Built incident transitions keep +200 and violations while open count becomes two", async () => {
    await page.getByRole("link", { name: "Incident inc-001", exact: true }).click(); await ready("/incidents/inc-001");
    assert.equal(await page.getByTestId("incident-version").innerText(), "0");
    await page.getByRole("button", { name: "Start investigation", exact: true }).click();
    await text(page.getByTestId("incident-version"), /^1$/);
    await page.getByRole("button", { name: "Resolve incident", exact: true }).click();
    await text(page.getByTestId("incident-version"), /^2$/);
    assert.equal(await page.locator("#incident-history tbody tr").count(), 3);
    await page.getByRole("link", { name: "Open event evt-003", exact: false }).click(); await ready("/events/evt-003");
    assert.equal(await evidence().innerText(), originalLedger);
    assert.equal(await page.locator("#evaluations").innerText(), originalEvaluations);
    await navigate("Overview", "/");
    assert.deepEqual(await stats(), ["30", "18", "2", "26"]);
  });
  await check("Built application create populates directory and empty Events filter", async () => {
    await navigate("Applications", "/applications");
    await page.getByRole("button", { name: "Create application", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("  Production smoke app  ");
    await page.getByLabel("Environment", { exact: true }).selectOption("DEVELOPMENT");
    await page.getByRole("button", { name: "Save application", exact: true }).click();
    await page.getByText(/3 applications · All records/).waitFor();
    assert.match(await page.locator("tbody tr").first().innerText(), /Production smoke app/);
    await navigate("Events", "/events");
    await page.getByLabel("Application", { exact: true }).selectOption({ label: "Production smoke app" });
    await page.getByRole("heading", { name: "No matching events", exact: true }).waitFor();
    await page.getByText("Showing 0 of 0", { exact: true }).waitFor();
  });
  await check("Built full reload resets all three mutations", async () => {
    await page.reload(); await ready("/events");
    assert.equal(await page.getByLabel("Application", { exact: true }).locator("option").count(), 3);
    await navigate("Overview", "/"); assert.deepEqual(await stats(), ["30", "18", "3", "26"]);
    await navigate("Monitoring Rules", "/rules");
    await page.getByLabel("Application", { exact: true }).selectOption("app-001");
    await page.locator('tr[data-rule-id="rule-002"]').getByRole("button", { name: /^Disable / }).waitFor();
    await page.getByRole("link", { name: "inc-001", exact: true }).first().click(); await ready("/incidents/inc-001");
    assert.equal(await page.getByTestId("incident-version").innerText(), "0");
  });
  await check("Built mobile drawer supports keyboard Escape and contained table overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/rules"); await ready("/rules");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const trigger = page.getByRole("button", { name: "Open navigation", exact: true });
    await trigger.focus(); await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: "Navigation", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Navigation", exact: true }).waitFor({ state: "hidden" });
    assert.ok(await trigger.evaluate(element => element === document.activeElement));
    await page.getByRole("region", { name: "Monitoring rules", exact: true }).focus();
    assert.ok(await page.getByRole("region", { name: "Monitoring rules", exact: true }).evaluate(element => element === document.activeElement));
  });
  await check("Production chunks loaded with no failed requests, runtime errors or mock API traffic", async () => {
    assert.ok([...assets].some(path => path.includes("EventDetailPage")));
    assert.ok([...assets].some(path => path.includes("IncidentDetailPage")));
    assert.ok([...assets].some(path => path.includes("EventVolumeChart")));
    assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []);
    assert.deepEqual(failedRequests, []); assert.deepEqual(failedResponses, []); assert.deepEqual(apiRequests, []);
  });
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  const result = { status: failure ? "FAIL" : "PASS", browser: browser?.version(), checks, checkCount: checks.length,
    failure, pageErrors, consoleErrors, failedRequests, failedResponses, apiRequests, assets: [...assets].sort(),
    note: "Built mock UI via Vite preview; no Backend integration or production hosting verification." };
  if (output) await writeFile(resolve(output, "5A-production-results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, checks: checks.length, failure }));
  await browser?.close();
  await new Promise((done, reject) => server.httpServer.close(error => error ? reject(error) : done()));
}
