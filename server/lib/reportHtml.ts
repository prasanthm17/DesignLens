import { readFile } from "fs/promises";
import { join } from "path";
import type { ReportModel } from "./report";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#b42318",
  high: "#c2410c",
  medium: "#a16207",
  low: "#2563eb",
  informational: "#475569",
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function scoreTone(score: number | null): string {
  if (score === null) return "#94a3b8";
  if (score >= 78) return "#0f766e";
  if (score >= 62) return "#a16207";
  return "#b42318";
}

async function inlineScreenshot(url: string | null, publicDir: string): Promise<string | null> {
  if (!url) return null;
  const filename = url.split("/").pop();
  if (!filename) return null;
  try {
    const buffer = await readFile(join(publicDir, "screenshots", filename));
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function renderReportHtml(
  model: ReportModel,
  options: { publicDir: string; forPdf?: boolean } = { publicDir: "public" },
): Promise<string> {
  const screenshot = await inlineScreenshot(model.evidence.screenshotUrl, options.publicDir);
  const metrics = model.evidence.metrics as {
    performance?: { loadEventMs?: number | null; domContentLoadedMs?: number | null; requestCount?: number; transferKb?: number | null };
    counts?: Record<string, number>;
    responsive?: Array<{ preset: string; width: number; overflow: boolean; overflowPx: number }>;
    readability?: { fleschReadingEase?: number | null; words?: number; averageSentenceLength?: number };
  };

  const severityRows = Object.entries(model.overview.severityCounts)
    .filter(([, count]) => count > 0)
    .map(
      ([severity, count]) =>
        `<tr><td><span class="pill" style="background:${SEVERITY_COLORS[severity]}1a;color:${SEVERITY_COLORS[severity]}">${esc(severity)}</span></td><td class="num">${count}</td></tr>`,
    )
    .join("");

  const scoreRows = model.scores
    .map(
      (score) => `<tr>
        <td><strong>${esc(score.label)}</strong><div class="muted">${score.automatedChecks} automated · ${score.manualChecks} manual prompts</div></td>
        <td class="num" style="color:${scoreTone(score.score)}">${score.score === null ? "not evaluated" : `${score.score}`}</td>
        <td class="num muted">${Math.round(score.weight * 100)}%</td>
        <td class="num">${score.findings}</td>
      </tr>`,
    )
    .join("");

  const findingBlock = (finding: ReportModel["keyFindings"][number]) => `
    <article class="finding">
      <header>
        <span class="pill" style="background:${SEVERITY_COLORS[finding.severity]}1a;color:${SEVERITY_COLORS[finding.severity]}">${esc(finding.severity)}</span>
        <span class="tag">${esc(finding.categoryLabel)}</span>
        ${finding.wcagCriterion ? `<span class="tag">${esc(finding.wcagCriterion)}</span>` : ""}
      </header>
      <h4>${esc(finding.title)}</h4>
      ${finding.evidence ? `<p class="evidence"><span>Evidence</span> ${esc(finding.evidence)}</p>` : ""}
      ${finding.whyItMatters ? `<p><span class="label">Why it matters</span> ${esc(finding.whyItMatters)}</p>` : ""}
      ${finding.recommendation ? `<p><span class="label">Recommendation</span> ${esc(finding.recommendation)}</p>` : ""}
      ${finding.implementation ? `<p class="code"><code>${esc(finding.implementation)}</code></p>` : ""}
    </article>`;

  const checkRows = model.checks
    .map(
      (check) => `<tr>
        <td>${esc(check.label)}<div class="muted">${esc(check.observed)}</div></td>
        <td><span class="pill ${check.status}">${esc(check.status)}</span></td>
        <td class="muted">${esc(check.expected)}</td>
        <td class="muted">${esc(check.detection)}</td>
      </tr>`,
    )
    .join("");

  const comparisonBlock = model.comparison
    ? `<section class="section">
        <h2>Comparison with previous audit</h2>
        <p class="muted">Compared against <strong>${esc(model.comparison.previousAuditName)}</strong> (${esc(model.comparison.previousScore ?? "—")}/100). Overall change: <strong style="color:${(model.comparison.delta ?? 0) >= 0 ? "#0f766e" : "#b42318"}">${model.comparison.delta === null ? "not comparable" : `${model.comparison.delta > 0 ? "+" : ""}${model.comparison.delta}`}</strong>.</p>
        <table>
          <thead><tr><th>Category</th><th class="num">Previous</th><th class="num">Current</th><th class="num">Change</th></tr></thead>
          <tbody>
            ${model.comparison.categories
              .map(
                (entry) => `<tr><td>${esc(entry.label)}</td><td class="num">${entry.previous ?? "—"}</td><td class="num">${entry.current ?? "—"}</td><td class="num">${entry.delta === null ? "—" : `${entry.delta > 0 ? "+" : ""}${entry.delta}`}</td></tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(model.audit.name)} — DesignLens audit report</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 10.5pt; line-height: 1.55; background: #fff; }
  @media screen {
    body { max-width: 840px; margin: 0 auto; padding: 44px 40px 72px; box-shadow: 0 0 0 1px #e2e8f0; }
    html { background: #f1f5f9; padding: 24px 0; }
  }
  h1,h2,h3,h4 { margin: 0; font-weight: 650; letter-spacing: -0.01em; }
  h1 { font-size: 26pt; line-height: 1.1; }
  h2 { font-size: 15pt; margin: 0 0 10px; }
  h3 { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; margin: 26px 0 8px; }
  h4 { font-size: 11.5pt; margin: 6px 0 6px; }
  p { margin: 0 0 8px; }
  .muted { color: #64748b; font-size: 9pt; }
  .label { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
  .cover { padding: 24px 0 28px; border-bottom: 2px solid #0f172a; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: 0.02em; }
  .mark { width: 22px; height: 22px; border-radius: 6px; background: #0f172a; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; }
  .tagline { color: #64748b; font-size: 9.5pt; margin-top: 4px; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 22px; }
  .meta div span { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; }
  .meta div strong { font-size: 10pt; }
  .hero { display: grid; grid-template-columns: 150px 1fr; gap: 26px; align-items: center; margin: 26px 0 8px; }
  .score-ring { text-align: center; }
  .score-ring .value { font-size: 44pt; font-weight: 700; line-height: 1; }
  .score-ring .grade { text-transform: uppercase; letter-spacing: 0.12em; font-size: 8pt; color: #64748b; }
  .section { margin-top: 26px; page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.07em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding: 6px 8px; }
  td { padding: 8px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .pill { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 8pt; font-weight: 600; text-transform: capitalize; }
  .pill.pass { background: #dcfce7; color: #15803d; }
  .pill.warn { background: #fef3c7; color: #b45309; }
  .pill.fail { background: #fee2e2; color: #b91c1c; }
  .pill.na { background: #f1f5f9; color: #64748b; }
  .tag { display: inline-block; font-size: 8pt; color: #475569; border: 1px solid #e2e8f0; border-radius: 999px; padding: 1px 7px; }
  .finding { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; page-break-inside: avoid; }
  .finding header { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
  .finding .evidence { background: #f8fafc; border-left: 2px solid #cbd5e1; padding: 6px 10px; font-size: 9pt; border-radius: 4px; }
  .finding .evidence span { font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.07em; color: #64748b; }
  .code code { display: block; background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 6px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 8.5pt; white-space: pre-wrap; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .stat { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
  .stat span { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.07em; color: #94a3b8; }
  .stat strong { font-size: 15pt; }
  .shot { width: 100%; border: 1px solid #e2e8f0; border-radius: 10px; margin-top: 8px; }
  ul { margin: 6px 0 10px 18px; padding: 0; }
  li { margin-bottom: 4px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
  .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 8pt; color: #94a3b8; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>
  <header class="cover">
    <div class="brand"><span class="mark">DL</span> DesignLens</div>
    <div class="tagline">See beyond the interface. Improve every experience.</div>
    <div style="margin-top:26px">
      <div class="muted">UX &amp; design quality audit</div>
      <h1>${esc(model.audit.name)}</h1>
      <p class="muted" style="margin-top:6px">${esc(model.project.name)} · ${esc(model.project.typeLabel)}</p>
    </div>
    <div class="meta">
      <div><span>Target</span><strong>${esc(model.audit.finalUrl)}</strong></div>
      <div><span>Audit completed</span><strong>${esc(formatDate(model.audit.completedAt))}</strong></div>
      <div><span>Categories evaluated</span><strong>${model.overview.evaluatedCategories} of ${model.overview.selectedCategories}</strong></div>
      <div><span>Findings</span><strong>${model.overview.findings}</strong></div>
    </div>
  </header>

  <section class="hero">
    <div class="score-ring">
      <div class="value" style="color:${scoreTone(model.overview.overallScore)}">${model.overview.overallScore ?? "—"}</div>
      <div class="grade">${esc(model.overview.grade)}</div>
      <div class="muted">out of 100</div>
    </div>
    <div>
      <h3 style="margin-top:0">Executive summary</h3>
      ${model.executiveSummary.map((line) => `<p>${esc(line)}</p>`).join("")}
    </div>
  </section>

  <section class="section">
    <h2>Category scores</h2>
    <table>
      <thead><tr><th>Category</th><th class="num">Score</th><th class="num">Weight</th><th class="num">Findings</th></tr></thead>
      <tbody>${scoreRows}</tbody>
    </table>
    <div class="two-col" style="margin-top:16px">
      <div>
        <h3>Severity distribution</h3>
        <table><tbody>${severityRows || '<tr><td class="muted">No findings recorded</td></tr>'}</tbody></table>
      </div>
      <div>
        <h3>Measured signals</h3>
        <div class="stat-grid" style="grid-template-columns:1fr 1fr">
          <div class="stat"><span>Load time</span><strong>${metrics.performance?.loadEventMs ?? "—"}<small>ms</small></strong></div>
          <div class="stat"><span>Requests</span><strong>${metrics.performance?.requestCount ?? "—"}</strong></div>
          <div class="stat"><span>Reading ease</span><strong>${metrics.readability?.fleschReadingEase ?? "—"}</strong></div>
          <div class="stat"><span>Words</span><strong>${metrics.readability?.words ?? "—"}</strong></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Audit scope &amp; objectives</h2>
    <p class="muted">${esc(model.project.description ?? "No project description was provided.")}</p>
    <ul>
      ${model.scope.map((entry) => `<li><strong>${esc(entry.label)}</strong> — ${esc(entry.notes[0] ?? "")}</li>`).join("")}
    </ul>
    ${model.project.targetAudience ? `<p><span class="label">Target audience</span>${esc(model.project.targetAudience)}</p>` : ""}
  </section>

  ${screenshot ? `<section class="section"><h2>Audited page</h2><img class="shot" src="${screenshot}" alt="Screenshot of the audited page" /></section>` : ""}

  <section class="section page-break">
    <h2>Key findings</h2>
    ${model.keyFindings.length ? model.keyFindings.map(findingBlock).join("") : '<p class="muted">No findings were raised by the automated checks that ran.</p>'}
  </section>

  ${model.criticalIssues.length ? `<section class="section"><h2>Critical and high-severity issues</h2>${model.criticalIssues.map(findingBlock).join("")}</section>` : ""}

  <section class="section">
    <div class="two-col">
      <div>
        <h3>Accessibility findings</h3>
        ${model.accessibilityFindings.length ? `<ul>${model.accessibilityFindings.map((finding) => `<li><strong>${esc(finding.title)}</strong> — ${esc(finding.severity)}</li>`).join("")}</ul>` : '<p class="muted">No accessibility findings recorded.</p>'}
      </div>
      <div>
        <h3>Visual &amp; consistency findings</h3>
        ${model.visualFindings.length ? `<ul>${model.visualFindings.map((finding) => `<li><strong>${esc(finding.title)}</strong> — ${esc(finding.severity)}</li>`).join("")}</ul>` : '<p class="muted">No visual design findings recorded.</p>'}
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Recommended priorities</h2>
    ${model.priorities
      .map(
        (group) => `<h3>${esc(group.horizon)}</h3><ul>${group.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`,
      )
      .join("") || '<p class="muted">No prioritised actions were generated.</p>'}
    <h3>Improvement roadmap</h3>
    <table>
      <thead><tr><th>Phase</th><th>Timeframe</th><th>Focus</th><th>Items</th></tr></thead>
      <tbody>
        ${model.roadmap
          .map(
            (phase) => `<tr><td><strong>${esc(phase.phase)}</strong></td><td>${esc(phase.timeframe)}</td><td>${esc(phase.focus)}</td><td class="num">${phase.items.length}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </section>

  ${comparisonBlock}

  <section class="section page-break">
    <h2>Methodology</h2>
    <ul>${model.methodology.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
    <h3>Check register</h3>
    <table>
      <thead><tr><th>Check</th><th>Result</th><th>Expected</th><th>Method</th></tr></thead>
      <tbody>${checkRows}</tbody>
    </table>
  </section>

  <div class="footer">
    Generated by DesignLens on ${esc(formatDate(model.product.generatedAt))}. Scores are derived from measurements taken on the rendered page at audit time; re-running the audit after changes will produce a new report.
  </div>
</body>
</html>`;
}
