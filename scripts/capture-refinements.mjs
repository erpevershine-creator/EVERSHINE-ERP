import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("docs/evidence", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    colorScheme: "light",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3000/accounts");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/account-form-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/evidence/account-form-mobile.png" });
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Create sample account", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Create sample account", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Close dialog" }),
  ).toBeInViewport();
  await page.screenshot({ path: "docs/evidence/account-form-mobile-end.png" });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("http://localhost:3000/permissions");
  await expect(
    page.getByLabel("Show Account Management", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/page-visibility-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 600 });
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await page.screenshot({ path: "docs/evidence/sidebar-scrolled-mobile.png" });
  expect(errors).toEqual([]);
  console.log(
    "Captured five refinement evidence images; no page errors or dialog overflow; mobile form actions are reachable.",
  );
} finally {
  await browser.close();
}
