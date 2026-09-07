import { test, expect, type Page } from "@playwright/test";

async function fillAccount(page: Page, username = "uat.employee@gmail.com") {
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Employee Name", { exact: true })
    .fill("UAT Employee");
  await page
    .getByRole("dialog")
    .getByLabel("Department", { exact: true })
    .fill("Operations");
  await page
    .getByRole("dialog")
    .getByLabel("Username", { exact: true })
    .fill(username);
  await page
    .getByRole("dialog")
    .getByLabel("Contact", { exact: true })
    .fill("09000000000");
  await page
    .getByRole("dialog")
    .getByLabel("Password", { exact: true })
    .fill("PreviewOnlyA7");
  await page
    .getByRole("dialog")
    .getByLabel("Confirm Password", { exact: true })
    .fill("PreviewOnlyA7");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 20;
    canvas.height = 20;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#456e81";
    ctx.fillRect(0, 0, 20, 20);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByRole("dialog")
    .getByLabel("Profile Photo", { exact: false })
    .setInputFiles({
      name: "sample-profile.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(
    page
      .getByRole("dialog")
      .getByRole("img", { name: "UAT Employee profile photo" }),
  ).toBeVisible();
}

test("sidebar controls stay within the viewport after scrolling on desktop and mobile", async ({
  page,
}) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 600 });
    await page.goto("/permissions");
    await expect(
      page.getByRole("heading", { level: 1, name: "Positions & Permissions" }),
    ).toBeVisible();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const toggle = page.getByRole("button", {
      name: width > 900 ? "Hide sidebar" : "Open navigation",
      exact: true,
    });
    const box = await toggle.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThan(600);
    await toggle.click();
    if (width > 900) {
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toBeHidden();
      await page
        .getByRole("button", { name: "Show sidebar", exact: true })
        .click();
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("link", { name: "Account Management", exact: true }),
      ).toBeInViewport();
      await page.keyboard.press("Escape");
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("account creation validates credentials, persists only sample profile, and previews the new account", async ({
  page,
}) => {
  await page.goto("/accounts");
  await fillAccount(page, "uat.employee@example.com");
  const save = page.getByRole("button", {
    name: "Create sample account",
    exact: true,
  });
  await save.click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "@gmail.com",
  );
  await page
    .getByRole("dialog")
    .getByLabel("Username", { exact: true })
    .fill("uat.employee@gmail.com");
  await page
    .getByRole("dialog")
    .getByLabel("Password", { exact: true })
    .fill("short");
  await save.click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "8 characters",
  );
  await page
    .getByRole("dialog")
    .getByLabel("Password", { exact: true })
    .fill("PreviewOnlyA7");
  await page
    .getByRole("dialog")
    .getByLabel("Confirm Password", { exact: true })
    .fill("DifferentA7");
  await save.click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "do not match",
  );
  await page
    .getByRole("dialog")
    .getByLabel("Confirm Password", { exact: true })
    .fill("PreviewOnlyA7");
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Open UAT Employee", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  for (const name of [
    "Employee Name",
    "Position",
    "Department",
    "ERP Role",
    "Username",
    "Contact",
    "Password",
  ])
    await expect(
      dialog.locator("dt").filter({ hasText: new RegExp(`^${name}$`) }),
    ).toBeVisible();
  await expect(
    dialog.getByRole("img", { name: "UAT Employee profile photo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const stored = await page.evaluate(() =>
    JSON.stringify({
      session: { ...sessionStorage },
      local: { ...localStorage },
    }),
  );
  expect(stored).not.toContain("PreviewOnlyA7");
  expect(stored).not.toContain("DifferentA7");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const stream = await (await downloaded).createReadStream();
  const parts: Buffer[] = [];
  for await (const part of stream!) parts.push(Buffer.from(part));
  const csv = Buffer.concat(parts).toString();
  expect(csv).toContain("UAT Employee");
  expect(csv).not.toContain("PreviewOnlyA7");
  expect(csv).not.toContain("data:image");
  await fillAccount(page, "UAT.EMPLOYEE@gmail.com");
  await save.click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "already assigned",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByLabel("Preview as").selectOption({ label: "UAT Employee" });
  await expect(
    page.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
  await page.goto("/approvals");
  await expect(
    page.getByRole("heading", { level: 1, name: "Approval Center" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open REQ-001", exact: true }),
  ).toHaveCount(0);
});

test("page visibility changes only after approval, applies to included accounts and blocks direct URLs", async ({
  page,
}) => {
  await page.goto("/accounts");
  await fillAccount(page);
  await page
    .getByRole("button", { name: "Create sample account", exact: true })
    .click();
  await page.goto("/permissions");
  await page.getByLabel("Show Audit & History", { exact: true }).uncheck();
  await page.getByLabel("Show Account Management", { exact: true }).check();
  await page.getByLabel("Employee (sample)", { exact: true }).check();
  await page
    .getByLabel("Reason note", { exact: true })
    .fill("Verify page access for the included employee.");
  await page
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Request submitted." }),
  ).toBeVisible();
  await page.getByLabel("Preview as").selectOption("employee");
  await page.goto("/audit");
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit & History" }),
  ).toBeVisible();
  await page.getByLabel("Preview as").selectOption("owner");
  await page.goto("/approvals");
  await page
    .getByRole("button", { name: /Page access · Operations Staff/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Included accounts: Employee (sample)",
  );
  await page
    .getByLabel("Reason note", { exact: true })
    .fill("Reviewed the page settings and exact included account.");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByLabel("Preview as").selectOption("employee");
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "Audit & History", exact: true }),
  ).toHaveCount(0);
  await page.goto("/audit");
  await expect(
    page.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
  await page.goto("/accounts");
  await expect(
    page.getByRole("heading", { level: 1, name: "Account Management" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Preview as").selectOption({ label: "UAT Employee" });
  await page.goto("/audit");
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit & History" }),
  ).toBeVisible();
  await page.goto("/accounts");
  await expect(
    page.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
});

test("existing sample sessions migrate without losing previous request history", async ({
  page,
}) => {
  await page.goto("/accounts");
  await expect(
    page.getByRole("heading", { level: 1, name: "Account Management" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const key = "evershine:m1:sample-session:v1";
    const sample = JSON.parse(sessionStorage.getItem(key)!);
    delete sample.accounts;
    delete sample.positions;
    sample.requests[0].title = "Preserved earlier sample";
    sessionStorage.setItem(key, JSON.stringify(sample));
  });
  await page.goto("/approvals");
  await expect(
    page.getByRole("button", { name: /Preserved earlier sample/ }),
  ).toBeVisible();
  await page.goto("/accounts");
  await expect(page.locator("tbody tr")).toHaveCount(4);
});

test("delegated Account Admin can create staff only within available position scope", async ({
  page,
}) => {
  await page.goto("/accounts");
  await page.getByLabel("Preview as").selectOption("admin");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "ERP Role", exact: true })
      .locator("option"),
  ).toHaveText(["Employee"]);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Position", exact: true })
      .locator("option"),
  ).toHaveText(["Operations Staff"]);
});
