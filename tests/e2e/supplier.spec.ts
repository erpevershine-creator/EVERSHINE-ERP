import { test, expect } from "@playwright/test";

test.describe("Supplier module", () => {
  test("authenticated user can open supplier page", async ({ page }) => {
    await page.goto("/suppliers");

    await expect(page).toHaveURL(/suppliers/);
    await expect(page.locator("body")).toContainText(/supplier/i);
  });
});
