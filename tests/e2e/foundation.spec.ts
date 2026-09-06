import { test, expect } from "@playwright/test";

test("all foundation routes load with one heading, no browser errors or external runtime requests", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/))
      external.push(request.url());
  });
  for (const [route, heading] of [
    ["dashboard", "Workspace"],
    ["accounts", "Account Management"],
    ["permissions", "Positions & Permissions"],
    ["approvals", "Approval Center"],
    ["audit", "Audit & History"],
    ["notifications", "Notifications"],
    ["settings", "Settings"],
    ["backups", "Backup & Restore"],
    ["usage", "Usage Monitor"],
    ["login", "Welcome back"],
  ]) {
    await page.goto("/" + route);
    await expect(
      page.getByRole("heading", { level: 1, name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Open local preview" }).click();
  await expect(page).toHaveURL(/dashboard/);
});
test("Owner approves one request with a reason; revise keeps the original version", async ({
  page,
}) => {
  await page.goto("/approvals");
  await page.getByRole("button", { name: "Open REQ-001", exact: true }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Enter a reason note",
  );
  await page
    .getByLabel("Reason note", { exact: true })
    .fill("Reviewed the sample device request.");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: /^Approved\d*/ }).click();
  await page.getByRole("button", { name: "Open REQ-001", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Requested changes", exact: true })
    .fill("Revised sample laptop description.");
  await page
    .getByLabel("Reason note", { exact: true })
    .fill("Corrected the sample description.");
  await page.getByRole("button", { name: "Revise", exact: true }).click();
  await page.getByRole("button", { name: /^Revised\d*/ }).click();
  await page.getByRole("button", { name: "Open REQ-001", exact: true }).click();
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  await expect(page.getByText("v1", { exact: true })).toBeVisible();
  await expect(page.getByText("v2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: /^Revised\d*/ }).click();
  await expect(
    page.getByRole("button", { name: "Open REQ-001", exact: true }),
  ).toBeVisible();
});
test("employee draft submits, scoped Admin rejects, and requester can edit and resubmit", async ({
  page,
}) => {
  await page.goto("/approvals");
  await page.getByLabel("Preview as").selectOption("employee");
  await expect(
    page.getByText("Position export permission", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open REQ-001", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page.getByLabel("Request title").fill("Sample account correction");
  await page.getByLabel("Target record").fill("Employee sample account");
  await page
    .getByLabel("Requested changes", { exact: true })
    .fill("Correct a sample display value.");
  await page.getByLabel("Reason note", { exact: true }).fill("Sample review.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: /Sample account correction/ }).click();
  await page
    .getByLabel("Reason note", { exact: true })
    .fill("Ready for review.");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await page.getByLabel("Preview as").selectOption("admin");
  await page.getByRole("button", { name: /^Pending\d*/ }).click();
  await page.getByRole("button", { name: /Sample account correction/ }).click();
  await page
    .getByLabel("Reason note", { exact: true })
    .fill("Clarify the proposed value.");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page.getByRole("button", { name: /^Rejected\d*/ }).click();
  await expect(
    page.getByRole("button", { name: /Sample account correction/ }),
  ).toBeVisible();
  await page.getByLabel("Preview as").selectOption("employee");
  await page.getByRole("button", { name: /^Draft\d*/ }).click();
  await page.getByRole("button", { name: /Sample account correction/ }).click();
  await expect(
    page.getByText("Clarify the proposed value.", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Requested changes", exact: true })
    .fill("Clarified sample value.");
  await page
    .getByLabel("Reason note", { exact: true })
    .fill("Clarified for review.");
  await page.getByRole("button", { name: "Submit for approval" }).click();
});
test("Admin cannot approve own request or manage permissions beyond delegated scope", async ({
  page,
}) => {
  await page.goto("/approvals");
  await page.getByLabel("Preview as").selectOption("admin");
  await page.getByRole("button", { name: "Open REQ-002", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("link", { name: "Positions & Permissions", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
});
test("search, column visibility, CSV download and notification read state work", async ({
  page,
}) => {
  await page.goto("/accounts");
  await page.getByRole("textbox", { name: "Search Accounts" }).fill("Former");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Columns", { exact: true }).click();
  await page.getByLabel("Active devices", { exact: true }).uncheck();
  await expect(
    page.getByRole("columnheader", { name: "Active devices" }),
  ).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe(
    "EVERSHINE-sample-accounts.csv",
  );
  await page.goto("/notifications");
  await page
    .getByRole("button", { name: "Open Third device access", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Notification status").selectOption("Unread");
  await expect(
    page.getByRole("button", { name: /Third device access/ }),
  ).toHaveCount(0);
});
test("light/dark/system themes persist, mobile navigation fits, usage boundary is honest", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: "System theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/usage");
  await page.getByRole("slider", { name: "Sample usage" }).fill("80");
  await expect(page.getByText("Paused", { exact: true })).toHaveCount(2);
  await expect(
    page.getByText("Allowed with usage warning", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Approval Center", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Approval Center", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
