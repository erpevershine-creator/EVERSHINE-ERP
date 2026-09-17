import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { secretCodec } from "./google-secret-store.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, ".runtime", "supplier-browser");
const config = await fs.readFile(
  path.join(directory, "supabase", "config.toml"),
  "utf8",
);
if (!config.includes('project_id = "evershine-supplier-browser-20260916"'))
  throw new Error("ISOLATED_PROJECT_REQUIRED");
const cli = path.join(root, "node_modules", "supabase", "dist", "supabase.js");
const status = JSON.parse(
  execFileSync(
    process.execPath,
    [cli, "status", "--workdir", directory, "--output", "json"],
    { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
  ).toString(),
);
if (status.API_URL !== "http://127.0.0.1:55621" || !status.SERVICE_ROLE_KEY)
  throw new Error("ISOLATED_API_REQUIRED");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const base = "http://127.0.0.1:3200";
const fixtureFile = path.join(directory, "synthetic-fixture.dpapi");
let fixture;
try {
  const raw = await secretCodec("Unprotect", await fs.readFile(fixtureFile));
  fixture = JSON.parse(raw.toString("utf8"));
  raw.fill(0);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!fixture) {
  fixture = {
    email: "browser.supplier.owner@gmail.com",
    password: `TestA1-${randomBytes(18).toString("hex")}`,
  };
  await fs.writeFile(
    fixtureFile,
    await secretCodec("Protect", Buffer.from(JSON.stringify(fixture))),
    { flag: "wx" },
  );
}
const photo = {
  name: "synthetic.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=",
    "base64",
  ),
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1365, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(45000);
const checks = [];
let stage = "owner setup";
try {
  await page.goto(base + "/setup/owner");
  if (await page.locator('input[name="employeeName"]').count()) {
    await page
      .locator('input[name="employeeName"]')
      .fill("Supplier Browser Owner");
    await page
      .locator('input[name="department"]')
      .fill("Isolated Supplier validation");
    await page.locator('input[name="username"]').fill(fixture.email);
    await page.locator('input[name="contact"]').fill("Synthetic only");
    await page.locator('input[name="password"]').fill(fixture.password);
    await page.locator('input[name="confirmPassword"]').fill(fixture.password);
    await page.locator('input[name="photo"]').setInputFiles(photo);
    await page
      .getByRole("button", { name: "Create Owner account", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Owner account is ready" }),
    ).toBeVisible();
  }
  stage = "login";
  await page.goto(base + "/login");
  await page.locator('input[name="username"]').fill(fixture.email);
  await page.locator('input[name="password"]').fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  checks.push("Synthetic Owner setup and authenticated session");

  stage = "create and submit";
  const suffix = Date.now();
  const originalName = `Browser Supplier ${suffix}`;
  const revisedName = `${originalName} Revised`;
  const initialReason = `Supplier browser onboarding ${suffix}`;
  await page.goto(base + "/suppliers");
  await expect(
    page.getByRole("button", { name: /New Supplier Form/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /New Supplier Form/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#supplier-legalName").fill(originalName);
  await dialog.locator("#supplier-city").fill("Yangon");
  await dialog.locator("#supplier-country").fill("Myanmar");
  await dialog.locator("#supplier-contactName").fill("U Browser Test");
  await dialog.locator("#supplier-contactPhone").fill("0912345678");
  await dialog
    .locator("#supplier-contactEmail")
    .fill("supplier.browser@example.com");
  await dialog
    .locator("#supplier-addressLine")
    .fill("No. 12, Isolated Test Road");
  await dialog.locator("#supplier-cityTownship").fill("Hlaing");
  await dialog.locator("#supplier-stateRegion").fill("Yangon");
  await dialog.locator("#supplier-currencyCode").selectOption("CNY");
  const simulator = dialog.locator(".sample-calc-box");
  await simulator.locator('input[type="number"]').nth(0).fill("100");
  await simulator.locator('input[type="number"]').nth(1).fill("2");
  await simulator.locator('input[type="number"]').nth(2).fill("20");
  await expect(
    dialog.getByText("No adjustments · Total = Sub Total", { exact: true }),
  ).toBeVisible();
  await dialog.locator("#supplier-reason").fill(initialReason);
  await dialog
    .getByRole("button", { name: "Submit for Approval", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "submitted to Approval Center",
  );
  const pendingRow = page.getByRole("row").filter({ hasText: originalName });
  await expect(pendingRow).toContainText("SUP-YGN-00001");
  await expect(pendingRow).toContainText("Pending");
  await page.screenshot({
    path: path.join(directory, "supplier-pending.png"),
    fullPage: true,
  });
  checks.push(
    "City code, CNY and zero-adjustment package submitted as one pending request",
  );

  stage = "initial approval";
  await page.goto(base + "/approvals");
  await page
    .getByRole("row")
    .filter({ hasText: initialReason })
    .getByRole("button", { name: /^Open / })
    .click();
  await expect(dialog).toContainText("SUP-YGN-00001");
  await expect(dialog).toContainText("CNY — Chinese Yuan");
  await expect(dialog).toContainText(
    "Total 200 · Sub Total 200.00 · Deposit 20.00 · Grand Total 180.00",
  );
  await dialog
    .getByLabel("Decision reason")
    .fill("Owner approves complete Supplier package");
  await dialog.getByRole("button", { name: "Record decision" }).click();
  await expect(dialog).toBeHidden();
  await page.goto(base + "/suppliers");
  const activeRow = page.getByRole("row").filter({ hasText: originalName });
  await expect(activeRow).toContainText("Active");
  checks.push("Approval activates Supplier, Agreement and Formula together");

  stage = "revision submission";
  await activeRow.getByRole("button", { name: /Edit/ }).click();
  await dialog.locator("#supplier-legalName").fill(revisedName);
  await dialog.locator("#supplier-currencyCode").selectOption("INR");
  await dialog
    .locator("#supplier-reason")
    .fill(`Supplier browser revision ${suffix}`);
  await dialog
    .getByRole("button", { name: "Submit for Re-approval", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "submitted to Approval Center",
  );
  const stillActive = page.getByRole("row").filter({ hasText: originalName });
  await expect(stillActive).toContainText("Active");
  await expect(
    stillActive.getByRole("button", { name: /Edit/ }),
  ).toBeDisabled();
  checks.push(
    "Pending revision leaves previous Active version effective and locked",
  );

  stage = "revision approval";
  const revisionReason = `Supplier browser revision ${suffix}`;
  await page.goto(base + "/approvals");
  await page
    .getByRole("row")
    .filter({ hasText: revisionReason })
    .getByRole("button", { name: /^Open / })
    .click();
  await expect(dialog).toContainText("Current Active package · revision 1");
  await expect(dialog).toContainText("Requested package · revision 2");
  await dialog
    .getByLabel("Decision reason")
    .fill("Owner approves Supplier revision");
  await dialog.getByRole("button", { name: "Record decision" }).click();
  await expect(dialog).toBeHidden();
  await page.goto(base + "/suppliers");
  const revisedRow = page.getByRole("row").filter({ hasText: revisedName });
  await expect(revisedRow).toContainText("Active");
  await expect(revisedRow).toContainText("INR");
  await revisedRow.getByRole("button", { name: /View/ }).click();
  await expect(dialog).toContainText("Revision 2 · active");
  await expect(dialog).toContainText("Revision 1 · archived");
  await dialog.screenshot({
    path: path.join(directory, "supplier-revision-history.png"),
  });
  checks.push(
    "Approved revision archives immutable version 1 and activates version 2",
  );

  stage = "database verification";
  const [suppliers, packages, agreements, formulas, requests] =
    await Promise.all([
      admin
        .from("suppliers")
        .select("id,supplier_code,legal_name,status,active_package_id"),
      admin
        .from("supplier_packages")
        .select("revision,status")
        .order("revision"),
      admin
        .from("supplier_commercial_agreements")
        .select("version,status")
        .order("version"),
      admin
        .from("supplier_financial_formulas")
        .select("version,status")
        .order("version"),
      admin
        .from("approval_requests")
        .select("request_type,status")
        .eq("request_type", "supplier_package"),
    ]);
  for (const query of [suppliers, packages, agreements, formulas, requests])
    if (query.error) throw query.error;
  expect(suppliers.data).toHaveLength(1);
  expect(suppliers.data[0]).toMatchObject({
    supplier_code: "SUP-YGN-00001",
    legal_name: revisedName,
    status: "active",
  });
  expect(packages.data).toEqual([
    { revision: 1, status: "archived" },
    { revision: 2, status: "active" },
  ]);
  expect(agreements.data).toEqual([
    { version: 1, status: "archived" },
    { version: 2, status: "active" },
  ]);
  expect(formulas.data).toEqual([
    { version: 1, status: "archived" },
    { version: 2, status: "active" },
  ]);
  expect(requests.data).toHaveLength(2);
  expect(requests.data.every((item) => item.status === "approved")).toBe(true);
  checks.push("Database state matches browser lifecycle and immutable history");

  stage = "responsive form";
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await revisedRow.getByRole("button", { name: /Edit/ }).click();
  const card = dialog.locator(".modal-card");
  const box = await card.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBeTruthy();
  await dialog.screenshot({
    path: path.join(directory, "supplier-edit-mobile.png"),
  });
  checks.push("Professional Supplier form remains within mobile viewport");

  await fs.writeFile(
    path.join(directory, "browser-evidence.json"),
    JSON.stringify(
      {
        status: "pass",
        isolatedOnly: true,
        checks,
        supplierCode: "SUP-YGN-00001",
        packageHistory: ["archived", "active"],
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ status: "pass", checks }));
} catch (error) {
  await page
    .screenshot({
      path: path.join(directory, "failure.png"),
      fullPage: true,
      timeout: 10000,
    })
    .catch(() => {});
  await fs.writeFile(
    path.join(directory, "browser-evidence.json"),
    JSON.stringify(
      {
        status: "fail",
        stage,
        url: page.url(),
        checks,
        error: error.message,
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.error(`Supplier browser check failed at ${stage}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
