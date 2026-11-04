/**
 * Dogfood run: audits the portfolio with DesignLens and prints the findings.
 * Requires the audit app to run with ALLOW_PRIVATE_TARGETS=1 for localhost.
 * Usage: node script/audit-portfolio.mjs <targetUrl> [base]
 */
const target = process.argv[2] || "http://localhost:3000/";
const base = process.argv[3] || "http://127.0.0.1:8080";

let cookie = "";
async function call(path, init = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

const email = `portfolio-audit${Date.now()}@designlens.test`;
await call("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ email, password: "portfolio-audit-2026", name: "Portfolio audit" }),
});

const project = await call("/api/projects", {
  method: "POST",
  body: JSON.stringify({
    name: "Portfolio QA",
    websiteUrl: target,
    projectType: "portfolio",
    pages: [{ name: "Home", url: target }],
  }),
});

const created = await call("/api/audits", {
  method: "POST",
  body: JSON.stringify({
    projectId: project.body.id,
    name: "Portfolio home · self-audit",
    targetUrl: target,
    scope: ["accessibility", "usability", "visual-design", "responsive", "content", "performance", "consistency"],
    targetAudience: "Recruiters and hiring managers",
    viewport: "all",
  }),
});

const id = created.body.audit.id;
for (let i = 0; i < 60; i += 1) {
  const status = await call(`/api/audits/${id}/status`);
  if (status.body.status === "completed") break;
  if (status.body.status === "failed") {
    console.log("FAILED:", status.body.error);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

const detail = await call(`/api/audits/${id}`);
const scores = Object.entries(detail.body.categoryScores || {}).map(([key, value]) => `${key}:${value.score ?? "n/e"}`);
console.log(`\n${target}`);
console.log("score:", detail.body.audit.overallScore, `(${detail.body.grade})`);
console.log("categories:", scores.join("  "));
console.log(`findings: ${detail.body.findings.length}`);
for (const finding of detail.body.findings.slice(0, 14)) {
  console.log(` - [${finding.severity}] ${finding.category} · ${finding.title}`);
  if (finding.evidence) console.log(`     ${finding.evidence.slice(0, 150)}`);
}
