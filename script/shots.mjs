/**
 * Captures product screenshots for the portfolio case study.
 * Usage: node script/shots.mjs [baseUrl] [outDir]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const base = process.argv[2] || "http://127.0.0.1:8080";
const outDir = resolve(process.argv[3] || "./public/shots");

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

async function shot(name, { fullPage = false } = {}) {
  await page.waitForTimeout(900);
  const path = resolve(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage, animations: "disabled" });
  console.log("saved", path);
}

// Establish a read-only demo session.
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.evaluate(async () => {
  await fetch("/api/auth/demo", { method: "POST", credentials: "include" });
});

await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Design quality at a glance");
await shot("dashboard");

// A completed demo audit.
const audit = await page.evaluate(async () => {
  const rows = await (await fetch("/api/audits?limit=1", { credentials: "include" })).json();
  return rows[0];
});

await page.goto(`${base}/audits/${audit.id}`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Category scores");
await shot("audit-overview");

await page.getByRole("button", { name: /Checks & methodology/i }).click();
await page.waitForTimeout(700);
await page.evaluate(() => window.scrollTo(0, 320));
await shot("audit-checks");

await page.goto(`${base}/audits/${audit.id}/report`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Executive summary");
await shot("report");

await page.goto(`${base}/findings`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Every issue across the workspace");
await shot("findings");

await page.goto(`${base}/audits/new?project=x`, { waitUntil: "networkidle" }).catch(() => {});

await browser.close();
