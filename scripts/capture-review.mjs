import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("docs/evidence", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    colorScheme: "light",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3000/dashboard");
  await page.getByText("Awaiting approval", { exact: true }).waitFor();
  await page.screenshot({
    path: "docs/evidence/workspace-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.screenshot({
    path: "docs/evidence/workspace-dark.png",
    fullPage: true,
  });
  await page.goto("http://localhost:3000/approvals");
  await page.getByRole("button", { name: "Open REQ-001", exact: true }).click();
  await page.screenshot({
    path: "docs/evidence/approval-detail.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth,
  );
  if (!fits) throw new Error("Mobile page overflows horizontally.");
  await page.screenshot({
    path: "docs/evidence/mobile-approvals.png",
    fullPage: true,
  });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Captured desktop light/dark, approval detail and mobile; no page errors.",
  );
} finally {
  await browser.close();
}
