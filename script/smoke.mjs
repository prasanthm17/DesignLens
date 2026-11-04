// End-to-end probe: register, create a project, run a real audit, poll, fetch report.
const BASE = process.env.BASE || "http://127.0.0.1:8080";
let cookie = "";

async function call(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(init.headers || {}),
    },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: res.status, body, headers: res.headers };
}

const stealth = process.env.STEALTH === "1";
if (stealth) await call("/api/auth/demo", { method: "POST" });

if (!stealth) {
  const email = `probe${Date.now()}@designlens.test`;
  let r = await call("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password: "designlens-probe", name: "Probe" }) });
  console.log("register", r.status);

  r = await call("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: "Probe project",
      description: "engine probe",
      websiteUrl: process.env.TARGET || "https://example.com",
      projectType: "saas",
      pages: [{ name: "Home", url: process.env.TARGET || "https://example.com" }],
    }),
  });
  console.log("project", r.status, r.body.id);
  const projectId = r.body.id;

  r = await call("/api/audits", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      name: "Probe audit",
      targetUrl: process.env.TARGET || "https://example.com",
      scope: ["accessibility", "usability", "visual-design", "responsive", "content", "performance", "consistency"],
      targetAudience: "General public",
      viewport: "all",
    }),
  });
  console.log("audit create", r.status, r.body?.audit?.id, r.body?.error ?? "");
  const auditId = r.body?.audit?.id;
  if (!auditId) process.exit(1);

  for (let i = 0; i < 90; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const s = await call(`/api/audits/${auditId}/status`);
    const stages = s.body.stages || [];
    console.log(`t+${(i + 1) * 2}s`, s.body.status, stages.filter((x) => x.status === "done").length + "/" + stages.length,
      stages.find((x) => x.status === "running")?.key ?? "");
    if (s.body.status === "completed" || s.body.status === "failed") {
      console.log("final", s.body.status, "score", s.body.overallScore, "error", s.body.error);
      break;
    }
  }

  const detail = await call(`/api/audits/${auditId}`);
  console.log("detail", detail.status, "findings", detail.body.findings?.length, "categories",
    Object.entries(detail.body.categoryScores || {}).map(([k, v]) => `${k}:${v.score}`).join(" "));
  console.log("checks", Object.values(detail.body.categoryScores || {}).reduce((n, c) => n + (c.checks?.length || 0), 0));
  console.log("score", detail.body.audit?.overallScore, detail.body.grade);
  for (const f of (detail.body.findings || []).slice(0, 5)) console.log(" -", f.severity, f.category, f.title);

  const html = await call(`/api/audits/${auditId}/report`);
  console.log("report html", html.status, typeof html.body === "string" ? html.body.length : "json");
  const json = await call(`/api/audits/${auditId}/report.json`);
  console.log("report json", json.status, json.body?.overview?.overallScore);
  const pdf = await fetch(`${BASE}/api/audits/${auditId}/report.pdf`, { headers: { cookie } });
  console.log("report pdf", pdf.status, pdf.headers.get("content-type"), (await pdf.arrayBuffer()).byteLength);
  console.log("dashboard", (await call("/api/dashboard")).body.totals);
}
