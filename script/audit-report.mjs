/**
 * Runs a full audit against a URL and saves the PDF report.
 * Usage: node script/audit-report.mjs <targetUrl> [base] [outFile]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const target = process.argv[2] || "http://localhost:3000/";
const base = process.argv[3] || "http://127.0.0.1:8080";
const outFile = process.argv[4] || "./public/reports/audit.pdf";

let cookie = "";
async function call(path, init = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return res;
}

const email = `report${Date.now()}@designlens.test`;
await call("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ email, password: "report-audit-2026", name: "Report run" }),
});

const project = await (await call("/api/projects", {
  method: "POST",
  body: JSON.stringify({
    name: "Portfolio · DesignLens branch",
    websiteUrl: target,
    projectType: "portfolio",
    pages: [{ name: "Home", url: target }],
  }),
})).json();

const created = await (await call("/api/audits", {
  method: "POST",
  body: JSON.stringify({
    projectId: project.id,
    name: "Portfolio home",
    targetUrl: target,
    scope: ["accessibility", "usability", "visual-design", "responsive", "content", "performance", "consistency"],
    targetAudience: "Recruiters and hiring managers",
    viewport: "all",
  }),
})).json();

const id = created.audit.id;
for (let i = 0; i < 80; i += 1) {
  const status = await (await call(`/api/audits/${id}/status`)).json();
  if (status.status === "completed") break;
  if (status.status === "failed") {
    console.log("FAILED:", status.error);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1500));
}

const detail = await (await call(`/api/audits/${id}`)).json();
console.log("audit:", id);
console.log("score:", detail.audit.overallScore, `(${detail.grade})`);
console.log(
  "categories:",
  Object.entries(detail.categoryScores || {})
    .map(([k, v]) => `${k}:${v.score ?? "n/e"}`)
    .join("  "),
);
console.log("checks:", detail.checks?.length ?? 0, "findings:", detail.findings.length);

const pdf = await call(`/api/audits/${id}/report.pdf`);
const buffer = Buffer.from(await pdf.arrayBuffer());
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, buffer);
console.log("pdf:", outFile, `${Math.round(buffer.length / 1024)}KB`, "status", pdf.status);
