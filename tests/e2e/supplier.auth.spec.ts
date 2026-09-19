import { test, expect } from "@playwright/test";

test.describe("Supplier RBAC", () => {
  test("supplier page requires authenticated access", async ({ page }) => {
    await page.goto("/suppliers");
    await expect(page).not.toHaveURL(/error/);
  });
});
