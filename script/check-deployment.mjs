/** Runs a real audit against the deployed DesignLens instance. */
const base = process.argv[2] || "https://designlens-fyaf.onrender.com";
const target = process.argv[3] || "https://example.com";

let cookie = "";
async function call(path, init = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text.slice(0, 200) };
  }
}

const email = `deploy${Date.now()}@designlens.test`;
const reg = await call("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ email, password: "deploy-check-2026", name: "Deploy check" }),
});
console.log("register:", reg.status);

const project = await call("/api/projects", {
  method: "POST",
  body: JSON.stringify({
    name: "Deployment check",
    websiteUrl: target,
    projectType: "saas",
    pages: [{ name: "Home", url: target }],
  }),
});
console.log("project:", project.status);

const created = await call("/api/audits", {
  method: "POST",
  body: JSON.stringify({
    projectId: project.body.id,
    name: "Container check",
    targetUrl: target,
    scope: ["accessibility", "usability", "visual-design", "responsive", "content", "performance", "consistency"],
    viewport: "all",
  }),
});
if (!created.body?.audit?.id) {
  console.log("audit create failed:", JSON.stringify(created.body).slice(0, 300));
  process.exit(1);
}
const id = created.body.audit.id;

for (let i = 0; i < 60; i += 1) {
  const status = await call(`/api/audits/${id}/status`);
  if (status.body.status === "completed") break;
  if (status.body.status === "failed") {
    console.log("AUDIT FAILED:", status.body.error);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 2000));
}

const detail = await call(`/api/audits/${id}`);
console.log(
  "result:",
  detail.body?.audit?.status,
  "| score:",
  detail.body?.audit?.overallScore,
  "| findings:",
  detail.body?.findings?.length,
);
const pdf = await fetch(`${base}/api/audits/${id}/report.pdf`, { headers: { cookie } });
const buffer = await pdf.arrayBuffer();
console.log("pdf:", pdf.status, `${Math.round(buffer.byteLength / 1024)}KB`);
