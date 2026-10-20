import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createMockMonitorApi } from "../src/services/mockMonitorApi.ts";
const { chromium } = await import(
  process.env.ERM_PLAYWRIGHT_MODULE ?? "playwright"
);
const output = process.env.ERM_UI_OUTPUT
  ? resolve(process.env.ERM_UI_OUTPUT)
  : null;
if (output) await mkdir(output, { recursive: true });
const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { host: "127.0.0.1", port: 0 },
  optimizeDeps: { include: ["ajv-formats", "ajv/dist/2020.js", "recharts"] },
});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const checks = [],
  errors = [],
  consoleErrors = [];
let browser, page;
const seed = createMockMonitorApi({ latencyMs: 0 }).api;
const seededRules = (await seed.listRules({ size: 100, sort: "name,asc" }))
  .items;
const linked = seededRules.find((r) =>
  r.relatedIncidentIds.includes("inc-001"),
);
assert.ok(linked);
const wait = async (predicate, message = "Condition did not settle") => {
  for (let i = 0; i < 160; i++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail(message);
};
const check = async (name, run) => {
  await run();
  checks.push(name);
  console.log(`PASS ${checks.length}: ${name}`);
};
const go = (path) => page.goto(base + path);
const harness = (query = "") =>
  go(`/tests/ui/configuration-harness.html?${query}`);
const appList = () => page.getByText(/applications · All records/).waitFor();
const ruleList = () =>
  page
    .getByRole("navigation", { name: "Rules pagination", exact: true })
    .waitFor();
const navText = async (text) =>
  wait(async () =>
    (
      await page
        .getByRole("navigation", { name: "Rules pagination", exact: true })
        .innerText()
    ).includes(text),
  );
const create = () =>
  page.getByRole("button", { name: "Create application", exact: true }).click();
const save = () =>
  page.getByRole("button", { name: "Save application", exact: true }).click();
const countWrites = () =>
  page.evaluate(() => window.ermConfigurationTest.writes.length);
const row = (id) => page.locator(`tr[data-rule-id="${id}"]`);
const filter = () => page.getByLabel("Application", { exact: true });
const shot = async (name) => {
  if (output)
    await page.screenshot({ path: resolve(output, name), fullPage: true });
};
const rulesReady = async (mode = "") => {
  await harness(`page=rules${mode ? `&mode=${mode}` : ""}`);
  await ruleList();
  await filter().selectOption("app-001");
  await navText("3 rules");
};
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.ERM_BROWSER_EXECUTABLE || undefined,
    args: JSON.parse(process.env.ERM_BROWSER_ARGS ?? "[]"),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !m
        .text()
        .startsWith(
          "Failed to load resource: the server responded with a status of",
        )
    )
      consoleErrors.push(m.text());
  });
  await check(
    "Applications reads two server records with IDs, environment, state and UTC",
    async () => {
      await go("/applications");
      await appList();
      assert.equal(await page.locator("tbody tr").count(), 2);
      assert.match(await page.locator("tbody").innerText(), /app-001/);
      assert.match(await page.locator("tbody").innerText(), /ACTIVE/);
      assert.match(await page.locator("tbody").innerText(), /UTC/);
      await shot("applications-desktop.png");
    },
  );
  await check(
    "Create form focuses labelled Name and exposes only supported environments",
    async () => {
      await harness();
      await appList();
      await create();
      assert.ok(
        await page
          .getByLabel("Name", { exact: true })
          .evaluate((e) => e === document.activeElement),
      );
      assert.deepEqual(
        await page
          .getByLabel("Environment", { exact: true })
          .locator("option")
          .evaluateAll((xs) => xs.map((x) => x.value)),
        ["SANDBOX", "DEVELOPMENT"],
      );
    },
  );
  await check("Cancel sends no POST and leaves two records", async () => {
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await countWrites(), 0);
    assert.equal(await page.locator("tbody tr").count(), 2);
  });
  for (const [name, value] of [
    ["empty", ""],
    ["whitespace", "   "],
    ["overlong", "a".repeat(101)],
  ])
    await check(`Client rejects ${name} name without a write`, async () => {
      if (!(await page.getByLabel("Name", { exact: true }).count()))
        await create();
      await page.getByLabel("Name", { exact: true }).fill(value);
      await save();
      await page
        .locator("#application-name-error")
        .getByText(/1–100/)
        .waitFor();
      assert.equal(await countWrites(), 0);
      assert.equal(
        await page
          .getByLabel("Name", { exact: true })
          .getAttribute("aria-invalid"),
        "true",
      );
    });
  await check(
    "Valid POST trims name, keeps DEVELOPMENT and reloads three applications",
    async () => {
      await page.getByLabel("Name", { exact: true }).fill("  Team Demo  ");
      await page
        .getByLabel("Environment", { exact: true })
        .selectOption("DEVELOPMENT");
      await save();
      await wait(async () => (await page.locator("tbody tr").count()) === 3);
      assert.match(
        await page.locator("tbody tr").first().innerText(),
        /Team Demo.*app-new-001/s,
      );
      assert.deepEqual(
        await page.evaluate(() => window.ermConfigurationTest.writes[0].body),
        { name: "Team Demo", environment: "DEVELOPMENT" },
      );
    },
  );
  await check(
    "Shared new application appears in Events and selects successful empty data",
    async () => {
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Events", exact: true })
        .click();
      await filter().selectOption({ label: "Team Demo" });
      await page
        .getByRole("heading", { name: "No matching events", exact: true })
        .waitFor();
      assert.ok(
        await page.getByText("Showing 0 of 0", { exact: true }).isVisible(),
      );
      assert.equal(await page.getByRole("alert").count(), 0);
    },
  );
  await check(
    "New application also has a successful empty Rules list",
    async () => {
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Monitoring Rules", exact: true })
        .click();
      await ruleList();
      await filter().selectOption({ label: "Team Demo" });
      await navText("0 rules · No pages");
      assert.ok(
        await page
          .getByRole("heading", { name: "No rules configured", exact: true })
          .isVisible(),
      );
    },
  );
  await check(
    "Full reload resets created application and directory",
    async () => {
      await page.reload();
      await appList();
      assert.equal(await page.locator("tbody tr").count(), 2);
      assert.equal(
        await page.getByText("Team Demo", { exact: true }).count(),
        0,
      );
    },
  );
  await check(
    "100 Unicode characters are accepted by real form and adapter",
    async () => {
      await harness();
      await appList();
      await create();
      await page.getByLabel("Name", { exact: true }).fill("😀".repeat(100));
      await save();
      await wait(async () => (await page.locator("tbody tr").count()) === 3);
      assert.equal(await countWrites(), 1);
    },
  );
  await check(
    "Pending create prevents synchronous repeated submit",
    async () => {
      await harness("mode=slow");
      await appList();
      await create();
      await page.getByLabel("Name", { exact: true }).fill("Single create");
      await page.locator("form").evaluate((f) => {
        f.requestSubmit();
        f.requestSubmit();
      });
      assert.ok(
        await page
          .getByRole("button", { name: "Creating…", exact: true })
          .isDisabled(),
      );
      await wait(async () => (await page.locator("tbody tr").count()) === 3);
      assert.equal(await countWrites(), 1);
    },
  );
  await check(
    "API rejection preserves create input and never reports success",
    async () => {
      await harness("mode=save-error");
      await appList();
      await create();
      await page.getByLabel("Name", { exact: true }).fill("Keep input");
      await save();
      await page
        .getByRole("heading", { name: "Change rejected", exact: true })
        .waitFor();
      assert.equal(
        await page.getByLabel("Name", { exact: true }).inputValue(),
        "Keep input",
      );
      assert.equal(await page.locator(".mutation-success").count(), 0);
      assert.equal(await page.locator("tbody tr").count(), 2);
      await save();
      await wait(async () => (await page.locator("tbody tr").count()) === 3);
      assert.equal(await countWrites(), 2);
    },
  );
  await check(
    "Adapter VALIDATION_ERROR maps field feedback and preserves form",
    async () => {
      await harness("mode=validation");
      await appList();
      await create();
      await page.getByLabel("Name", { exact: true }).fill("Rejected name");
      await save();
      await page
        .getByText("Choose a different sample name.", { exact: true })
        .waitFor();
      assert.equal(
        await page.getByLabel("Name", { exact: true }).inputValue(),
        "Rejected name",
      );
      assert.equal(await countWrites(), 1);
    },
  );
  await check(
    "Lost POST acknowledgement blocks replay until a successful read reconciliation",
    async () => {
      await harness("mode=lost-ack");
      await appList();
      await create();
      await page.getByLabel("Name", { exact: true }).fill("Committed once");
      await save();
      await page
        .getByRole("heading", { name: "Save outcome uncertain", exact: true })
        .waitFor();
      assert.ok(
        await page
          .getByRole("button", { name: "Save application", exact: true })
          .isDisabled(),
      );
      assert.equal(await countWrites(), 1);
      assert.equal(await page.locator(".mutation-success").count(), 0);
      await page.evaluate(() =>
        window.ermConfigurationTest.controls.failNext(
          "listApplications",
          "SERVICE_UNAVAILABLE",
        ),
      );
      await page
        .getByRole("button", { name: "Reload applications", exact: true })
        .click();
      await page.getByText(/Could not reload the list/).waitFor();
      assert.ok(
        await page
          .getByRole("button", { name: "Save application", exact: true })
          .isDisabled(),
      );
      await page
        .getByRole("button", { name: "Reload applications", exact: true })
        .click();
      await wait(async () => (await page.locator("tbody tr").count()) === 3);
      assert.equal(await countWrites(), 1);
      assert.equal(
        await page.getByLabel("Name", { exact: true }).inputValue(),
        "Committed once",
      );
      assert.ok(
        await page
          .getByRole("button", { name: "Save application", exact: true })
          .isEnabled(),
      );
    },
  );
  for (const mode of ["slow", "empty", "error"])
    await check(
      `Applications ${mode} is distinct and retry recovers`,
      async () => {
        await harness(`mode=${mode}`);
        if (mode === "slow") {
          await page
            .getByText("Loading applications", { exact: true })
            .waitFor();
          assert.equal(await page.locator("tbody tr").count(), 0);
          await appList();
        } else if (mode === "empty") {
          await page
            .getByRole("heading", {
              name: "No applications configured",
              exact: true,
            })
            .waitFor();
          assert.equal(await page.getByRole("alert").count(), 0);
        } else {
          await page
            .getByRole("heading", {
              name: "Could not load applications",
              exact: true,
            })
            .waitFor();
          await page
            .getByRole("button", { name: "Retry", exact: true })
            .click();
          await appList();
          assert.equal(await page.locator("tbody tr").count(), 2);
        }
      },
    );
  await check(
    "Rules pagination reads all six IDs across two real pages",
    async () => {
      await go("/rules");
      await ruleList();
      await navText("6 rules · Page 1 of 2");
      const ids = await page
        .locator("tr[data-rule-id]")
        .evaluateAll((xs) => xs.map((x) => x.dataset.ruleId));
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await navText("Page 2 of 2");
      ids.push(
        ...(await page
          .locator("tr[data-rule-id]")
          .evaluateAll((xs) => xs.map((x) => x.dataset.ruleId))),
      );
      assert.deepEqual(
        ids,
        seededRules.map((x) => x.id),
      );
      assert.ok(
        await page
          .getByRole("button", { name: "Next", exact: true })
          .isDisabled(),
      );
      await shot("rules-desktop.png");
    },
  );
  await check(
    "Rules application filter resets page and totals, clear restores all six",
    async () => {
      await filter().selectOption("app-001");
      await navText("3 rules · Page 1 of 1");
      for (const id of await page
        .locator("tr[data-rule-id]")
        .evaluateAll((xs) => xs.map((x) => x.dataset.ruleId)))
        assert.equal(
          seededRules.find((x) => x.id === id).applicationId,
          "app-001",
        );
      await page
        .getByRole("button", { name: "Clear filter", exact: true })
        .click();
      await navText("6 rules · Page 1 of 2");
    },
  );
  await check(
    "Rule sorting sends only name DESC and returns contract order",
    async () => {
      await harness("page=rules");
      await ruleList();
      await page
        .getByLabel("Rule order", { exact: true })
        .selectOption("name,desc");
      await wait(
        async () =>
          (await page
            .locator("tr[data-rule-id]")
            .first()
            .getAttribute("data-rule-id")) ===
          (await seed.listRules({ size: 3, sort: "name,desc" })).items[0].id,
      );
      assert.ok(
        await page.evaluate(() =>
          window.ermConfigurationTest.queries.some(
            (x) => x.method === "listRules" && x.query.sort === "name,desc",
          ),
        ),
      );
    },
  );
  await check(
    "All three discriminated rule configs show exact fields and evidence semantics",
    async () => {
      await rulesReady();
      for (const rule of seededRules.filter(
        (r) => r.applicationId === "app-001",
      )) {
        const text = await row(rule.id).innerText();
        assert.ok(text.includes(rule.ruleType));
        for (const [key, value] of Object.entries(rule.config)) {
          assert.ok(text.includes(key));
          assert.ok(text.includes(String(value)));
        }
        assert.ok(text.includes("Config version " + rule.configVersion));
        assert.ok(text.includes("UTC"));
      }
      assert.ok(
        (await page.locator("tbody").innerText()).includes(
          "elapsed time alone does not establish a violation",
        ),
      );
    },
  );
  await check(
    "Confirmed rule disable uses desired boolean and retains configVersion",
    async () => {
      await row(linked.id)
        .getByRole("button", { name: /^Disable / })
        .click();
      await row(linked.id)
        .getByRole("button", { name: /^Enable / })
        .waitFor();
      const saved = await page.evaluate(
        (id) =>
          window.ermConfigurationTest
            .rules({ size: 100 })
            .then((p) => p.items.find((x) => x.id === id)),
        linked.id,
      );
      assert.equal(saved.enabled, false);
      assert.equal(saved.configVersion, linked.configVersion);
      assert.deepEqual(
        await page.evaluate(() => window.ermConfigurationTest.writes[0].body),
        { enabled: false },
      );
    },
  );
  await check(
    "Rule toggle leaves complete historical event, incident and ledger aggregates unchanged",
    async () => {
      assert.deepEqual(
        await page.evaluate(() => window.ermConfigurationTest.detail()),
        await seed.getEventDetail("evt-003"),
      );
      assert.deepEqual(
        await page.evaluate(() => window.ermConfigurationTest.incident()),
        await seed.getIncidentDetail("inc-001"),
      );
    },
  );
  await check(
    "Related links use response IDs and open preserved event and incident evidence",
    async () => {
      const hrefs = await row(linked.id)
        .locator("a")
        .evaluateAll((xs) => xs.map((x) => x.getAttribute("href")));
      assert.deepEqual(hrefs, [
        ...linked.relatedEventIds.map((id) => `/events/${id}`),
        ...linked.relatedIncidentIds.map((id) => `/incidents/${id}`),
      ]);
      await row(linked.id)
        .getByRole("link", { name: "evt-003", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Business evidence", exact: true })
        .waitFor();
      assert.ok((await page.locator("body").innerText()).includes("VIOLATION"));
      await page.locator('a[href="/incidents/inc-001"]').first().click();
      await page
        .getByRole("heading", { name: "Investigation history", exact: true })
        .waitFor();
      assert.equal(
        await page.getByTestId("incident-version").innerText(),
        (await seed.getIncidentDetail("inc-001")).version,
      );
    },
  );
  await check(
    "Revisiting Rules shares disabled state; enabling again does not replay history",
    async () => {
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Monitoring Rules", exact: true })
        .click();
      await ruleList();
      await filter().selectOption("app-001");
      await navText("3 rules");
      await row(linked.id)
        .getByRole("button", { name: /^Enable / })
        .click();
      await row(linked.id)
        .getByRole("button", { name: /^Disable / })
        .waitFor();
      assert.deepEqual(
        await page.evaluate(() => window.ermConfigurationTest.detail()),
        await seed.getEventDetail("evt-003"),
      );
    },
  );
  await check("Full reload restores seeded enabled states", async () => {
    await row(linked.id)
      .getByRole("button", { name: /^Disable / })
      .click();
    await row(linked.id)
      .getByRole("button", { name: /^Enable / })
      .waitFor();
    await page.reload();
    await ruleList();
    await filter().selectOption("app-001");
    await navText("3 rules");
    assert.ok(
      await row(linked.id)
        .getByRole("button", { name: /^Disable / })
        .isEnabled(),
    );
  });
  await check(
    "Pending rule change never optimistically flips and blocks repeated writes",
    async () => {
      await rulesReady("slow");
      await row(linked.id)
        .locator("button")
        .first()
        .evaluate((b) => {
          b.click();
          b.click();
        });
      assert.ok(await row(linked.id).locator("button").first().isDisabled());
      assert.equal(
        await row(linked.id).locator(".status-badge").innerText(),
        "Enabled",
      );
      await row(linked.id)
        .getByRole("button", { name: /^Enable / })
        .waitFor();
      assert.equal(await countWrites(), 1);
    },
  );
  await check(
    "Rejected PATCH preserves enabled status, rows and manual retry semantics",
    async () => {
      await rulesReady("save-error");
      await row(linked.id)
        .getByRole("button", { name: /^Disable / })
        .click();
      await row(linked.id)
        .getByRole("heading", { name: "Change rejected", exact: true })
        .waitFor();
      assert.equal(
        await row(linked.id).locator(".status-badge").innerText(),
        "Enabled",
      );
      assert.equal(await page.locator("tr[data-rule-id]").count(), 3);
      assert.equal(await countWrites(), 1);
      await row(linked.id)
        .getByRole("button", { name: /^Disable / })
        .click();
      await row(linked.id)
        .getByRole("button", { name: /^Enable / })
        .waitFor();
      assert.equal(await countWrites(), 2);
    },
  );
  await check(
    "Lost PATCH acknowledgement retains last confirmed state and requires successful read",
    async () => {
      await rulesReady("lost-ack");
      await row(linked.id)
        .getByRole("button", { name: /^Disable / })
        .click();
      await row(linked.id)
        .getByRole("heading", { name: "Save outcome uncertain", exact: true })
        .waitFor();
      assert.equal(
        await row(linked.id).locator(".status-badge").innerText(),
        "Enabled",
      );
      assert.equal(await countWrites(), 1);
      await page.evaluate(() =>
        window.ermConfigurationTest.controls.failNext(
          "listRules",
          "SERVICE_UNAVAILABLE",
        ),
      );
      await row(linked.id)
        .getByRole("button", { name: "Reload rules", exact: true })
        .click();
      await row(linked.id)
        .getByText(/Could not confirm current state/)
        .waitFor();
      assert.ok(
        await row(linked.id)
          .getByRole("button", { name: /^Disable / })
          .isDisabled(),
      );
      await row(linked.id)
        .getByRole("button", { name: "Reload rules", exact: true })
        .click();
      await row(linked.id)
        .getByRole("button", { name: /^Enable / })
        .waitFor();
      assert.equal(await countWrites(), 1);
    },
  );
  for (const mode of ["slow", "empty", "error"])
    await check(`Rules ${mode} is distinct and retry recovers`, async () => {
      await harness(`page=rules&mode=${mode}`);
      if (mode === "slow") {
        await page.getByText("Loading rules", { exact: true }).waitFor();
        assert.equal(await page.locator("tr[data-rule-id]").count(), 0);
        await ruleList();
      } else if (mode === "empty") {
        await page
          .getByRole("heading", { name: "No rules configured", exact: true })
          .waitFor();
        await navText("0 rules · No pages");
      } else {
        await page
          .getByRole("heading", { name: "Could not load rules", exact: true })
          .waitFor();
        await page.getByRole("button", { name: "Retry", exact: true }).click();
        await ruleList();
      }
    });
  await check(
    "Unavailable application metadata falls back to real IDs without losing rules",
    async () => {
      await harness("page=rules&mode=app-error");
      await ruleList();
      await page
        .getByRole("heading", {
          name: "Application names unavailable",
          exact: true,
        })
        .waitFor();
      assert.equal(await page.locator("tr[data-rule-id]").count(), 3);
      assert.ok((await page.locator("tbody").innerText()).includes("app-001"));
      assert.ok(
        !(await page.locator("tbody").innerText()).includes("Loyalty Sandbox"),
      );
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await wait(async () => await filter().isEnabled());
    },
  );
  await check(
    "Late Rules filter response cannot overwrite the newer query",
    async () => {
      await harness("page=rules&mode=race");
      await ruleList();
      await filter().selectOption("app-001");
      await new Promise((r) => setTimeout(r, 60));
      await filter().selectOption("app-002");
      await navText("3 rules");
      await new Promise((r) => setTimeout(r, 700));
      for (const id of await page
        .locator("tr[data-rule-id]")
        .evaluateAll((xs) => xs.map((x) => x.dataset.ruleId)))
        assert.equal(
          seededRules.find((x) => x.id === id).applicationId,
          "app-002",
        );
    },
  );
  await check(
    "Rules page shrink recovers a valid empty page without stale rows",
    async () => {
      await harness("page=rules&mode=page-shrink");
      await ruleList();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await navText("0 rules · No pages");
      assert.equal(await page.locator("tr[data-rule-id]").count(), 0);
    },
  );
  await check(
    "Event pagination states sort, exact ranges, page buttons and disabled limits",
    async () => {
      await go("/events");
      await page.getByText("Showing 1–10 of 30", { exact: true }).waitFor();
      assert.ok(
        await page
          .getByText("Newest first · occurredAt DESC", { exact: true })
          .isVisible(),
      );
      assert.ok(
        await page
          .getByRole("button", { name: "Previous", exact: true })
          .isDisabled(),
      );
      await page.getByRole("button", { name: "Page 3", exact: true }).click();
      await page.getByText("Showing 21–30 of 30", { exact: true }).waitFor();
      assert.ok(
        await page
          .getByRole("button", { name: "Next", exact: true })
          .isDisabled(),
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Page 3", exact: true })
          .getAttribute("aria-current"),
        "page",
      );
      await page
        .getByLabel("Logical event ID", { exact: true })
        .fill("missing-xyz");
      await page.getByText("Showing 0 of 0", { exact: true }).waitFor();
      assert.ok(
        await page
          .getByRole("button", { name: "Previous", exact: true })
          .isDisabled(),
      );
    },
  );
  await check(
    "Combined navigation preserves investigation workflow across all seven screens",
    async () => {
      await go("/");
      await page
        .getByRole("link", { name: "inc-001", exact: true })
        .first()
        .click();
      await page
        .getByRole("button", { name: "Start investigation", exact: true })
        .click();
      await wait(
        async () =>
          (await page.getByTestId("incident-version").innerText()) === "1",
      );
      await page
        .getByRole("button", { name: "Resolve incident", exact: true })
        .click();
      await wait(
        async () =>
          (await page.getByTestId("incident-version").innerText()) === "2",
      );
      await page.locator('a[href="/events/evt-003"]').first().click();
      await page
        .getByRole("heading", { name: "Business evidence", exact: true })
        .waitFor();
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      for (const name of [
        "Events",
        "Incidents",
        "Monitoring Rules",
        "Applications",
        "Overview",
      ]) {
        await nav.getByRole("link", { name, exact: true }).click();
        await page.getByRole("heading", { level: 1 }).waitFor();
      }
      await wait(
        async () =>
          (await page
            .locator(".stat-card")
            .filter({ hasText: "Open incidents" })
            .locator(".stat-value")
            .innerText()) === "2",
      );
      assert.ok(
        !(await page.locator("main").innerText()).includes("not available yet"),
      );
    },
  );
  for (const width of [1440, 768, 390])
    await check(
      `All seven routes stay within document width ${width}px`,
      async () => {
        await page.setViewportSize({ width, height: 1000 });
        for (const path of [
          "/",
          "/applications",
          "/rules",
          "/events",
          "/events/evt-003",
          "/incidents",
          "/incidents/inc-001",
        ]) {
          await go(path);
          await page.getByRole("heading", { level: 1 }).waitFor();
          await wait(
            async () => (await page.locator(".loading-skeleton").count()) === 0,
          );
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `${width} ${path} overflows`,
          );
          if (path === "/applications") {
            await create();
            await page
              .getByLabel("Name", { exact: true })
              .fill("Accessible form");
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
              ),
            );
            await shot(`applications-form-${width}.png`);
          }
          if (path === "/rules") await shot(`rules-${width}.png`);
        }
      },
    );
  await check(
    "Mobile drawer navigates, Escape closes, form keyboard focus is visible",
    async () => {
      await go("/applications");
      await appList();
      const open = page.getByRole("button", {
        name: "Open navigation",
        exact: true,
      });
      await open.click();
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
      await open.click();
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "Monitoring Rules", exact: true })
        .click();
      await ruleList();
      assert.equal(await page.getByRole("dialog").count(), 0);
      await go("/applications");
      await appList();
      await create();
      await page.keyboard.press("Tab");
      assert.ok(
        await page
          .getByLabel("Environment", { exact: true })
          .evaluate((e) => e === document.activeElement),
      );
      assert.equal(
        await page
          .getByLabel("Environment", { exact: true })
          .evaluate((e) => getComputedStyle(e).outlineStyle),
        "solid",
      );
      await page.keyboard.press("Tab");
      assert.ok(
        await page
          .getByRole("button", { name: "Save application", exact: true })
          .evaluate((e) => e === document.activeElement),
      );
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      assert.equal(await page.getByLabel("Name", { exact: true }).count(), 0);
    },
  );
  await check(
    "Configuration form text and controls meet 4.5:1 text contrast",
    async () => {
      await go("/applications");
      await appList();
      await create();
      await save();
      const results = await page.evaluate(() => {
        const rgb = (value) =>
          value
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number);
        const luminance = (color) =>
          rgb(color)
            .map((v) => {
              const c = v / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            })
            .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        return [
          ...document.querySelectorAll(
            ".configuration-form label, .configuration-form input, .configuration-form select, .configuration-form button:not(:disabled), .field-error:not(:empty), thead th",
          ),
        ].map((element) => {
          let parent = element,
            background = "rgb(12,21,16)";
          while (parent) {
            const candidate = getComputedStyle(parent).backgroundColor;
            if (
              candidate !== "rgba(0, 0, 0, 0)" &&
              candidate !== "transparent"
            ) {
              background = candidate;
              break;
            }
            parent = parent.parentElement;
          }
          const a = luminance(getComputedStyle(element).color),
            b = luminance(background);
          return {
            label: element.textContent || element.tagName,
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          };
        });
      });
      assert.ok(results.length >= 10);
      for (const result of results)
        assert.ok(result.ratio >= 4.5, `${result.label}: ${result.ratio}`);
    },
  );
  await check(
    "Real HTTP adapter serializes application POST and rule PATCH with response doubles",
    async () => {
      await page.setViewportSize({ width: 1440, height: 1050 });
      const http = createMockMonitorApi({ latencyMs: 0 }).api,
        calls = [];
      await page.route("**/api/v1/**", async (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          path = url.pathname.slice("/api/v1".length);
        calls.push({ method: req.method(), path, body: req.postDataJSON() });
        let body,
          status = 200;
        if (path === "/applications" && req.method() === "GET")
          body = await http.listApplications({
            page: Number(url.searchParams.get("page") ?? 0),
            size: Number(url.searchParams.get("size") ?? 100),
            sort: url.searchParams.get("sort") ?? "createdAt,desc",
          });
        else if (path === "/applications" && req.method() === "POST") {
          body = await http.createApplication(req.postDataJSON());
          status = 201;
        } else if (path === "/rules" && req.method() === "GET")
          body = await http.listRules({
            page: Number(url.searchParams.get("page") ?? 0),
            size: Number(url.searchParams.get("size") ?? 3),
            sort: url.searchParams.get("sort") ?? "name,asc",
            applicationId: url.searchParams.get("applicationId") ?? "",
          });
        else if (path.startsWith("/rules/") && req.method() === "PATCH")
          body = await http.updateRule(
            decodeURIComponent(path.slice(7)),
            req.postDataJSON(),
          );
        else throw new Error(`Unexpected HTTP ${path}`);
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      });
      await harness("mode=http");
      await appList();
      await create();
      await page.getByLabel("Name", { exact: true }).fill("HTTP app");
      await save();
      await wait(async () => (await page.locator("tbody tr").count()) === 3);
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Monitoring Rules", exact: true })
        .click();
      await ruleList();
      await filter().selectOption("app-001");
      await navText("3 rules");
      await row(linked.id)
        .getByRole("button", { name: /^Disable / })
        .click();
      await row(linked.id)
        .getByRole("button", { name: /^Enable / })
        .waitFor();
      assert.deepEqual(calls.find((x) => x.method === "POST").body, {
        name: "HTTP app",
        environment: "SANDBOX",
      });
      assert.deepEqual(calls.find((x) => x.method === "PATCH").body, {
        enabled: false,
      });
      await page.unroute("**/api/v1/**");
    },
  );
  await check(
    "No uncaught browser errors, unhandled rejections or unexpected console errors",
    async () => {
      assert.deepEqual(errors, []);
      assert.deepEqual(consoleErrors, []);
    },
  );
} finally {
  if (output)
    await writeFile(
      resolve(output, "4C-browser-results.json"),
      JSON.stringify(
        { checks, passed: checks.length, errors, consoleErrors },
        null,
        2,
      ),
    );
  await browser?.close();
  await server.close();
}
console.log(JSON.stringify({ passed: checks.length, errors, consoleErrors }));
