import { test as setup } from "@playwright/test";

setup("authenticate", async ({ page }) => {
  // Production E2E auth hook.
  // Configure test credentials through CI secrets before enabling.
  await page.goto("/login");
});
