/**
 * Runs a real audit against a public page and captures evidence screenshots.
 * Usage: node script/shots-real.mjs [baseUrl] [targetUrl] [outDir]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const base = process.argv[2] || "http://127.0.0.1:8080";
const target = process.argv[3] || "https://example.com";
const outDir = resolve(process.argv[4] || "./public/shots");

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();

const email = `shots${Date.now()}@designlens.test`;
const password = "portfolio-shots-2026";

async function shot(name, { scrollTo = 0 } = {}) {
  await page.evaluate((y) => window.scrollTo(0, y), scrollTo);
  await page.waitForTimeout(900);
  const path = resolve(outDir, `${name}.png`);
  await page.screenshot({ path, animations: "disabled" });
  console.log("saved", path);
}

await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.evaluate(
  async ({ email, password }) => {
    await fetch("/api/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name: "Reference audit" }),
    });
  },
  { email, password },
);

const project = await page.evaluate(async (targetUrl) => {
  const res = await fetch("/api/projects", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Reference site",
      description: "Public reference page used to demonstrate a live audit run.",
      websiteUrl: targetUrl,
      projectType: "marketing-site",
      pages: [{ name: "Homepage", url: targetUrl }],
    }),
  });
  return res.json();
}, target);

const created = await page.evaluate(
  async ({ projectId, targetUrl }) => {
    const res = await fetch("/api/audits", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        name: "Homepage · live audit",
        targetUrl,
        scope: ["accessibility", "usability", "visual-design", "responsive", "content", "performance", "consistency"],
        targetAudience: "General public",
        viewport: "all",
      }),
    });
    return res.json();
  },
  { projectId: project.id, targetUrl: target },
);

const auditId = created.audit.id;
for (let i = 0; i < 60; i += 1) {
  const status = await page.evaluate(
    async (id) => (await fetch(`/api/audits/${id}/status`, { credentials: "include" })).json(),
    auditId,
  );
  if (status.status === "completed") break;
  if (status.status === "failed") throw new Error(status.error);
  await page.waitForTimeout(1500);
}

await page.goto(`${base}/audits/${auditId}`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Category scores");
await shot("live-audit-overview");

await page.getByRole("button", { name: /Checks & methodology/i }).click();
await page.waitForTimeout(700);
await shot("live-audit-checks", { scrollTo: 380 });

await page.getByRole("button", { name: /Findings \(/i }).click();
await page.waitForTimeout(700);
await shot("live-audit-findings", { scrollTo: 300 });

await page.getByRole("button", { name: "Evidence" }).click();
await page.waitForTimeout(700);
await shot("live-audit-evidence", { scrollTo: 250 });

console.log("audit", auditId);
await browser.close();
