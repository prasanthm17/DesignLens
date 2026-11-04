import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportModel } from "./report";
import type { Audit, Finding, Project } from "@shared/schema";
import type { CategoryScore } from "./scoring";

const now = new Date("2026-03-01T10:00:00.000Z");

function categoryScore(category: string, score: number | null, findings = 1): CategoryScore {
  return {
    category: category as CategoryScore["category"],
    score,
    passedWeight: 6,
    totalWeight: 10,
    automatedChecks: 6,
    manualChecks: 2,
    checks: [
      {
        id: `${category}-1`,
        label: `${category} check`,
        category: category as CategoryScore["category"],
        status: score === null ? "na" : score > 70 ? "pass" : "fail",
        weight: 2,
        observed: "observed value",
        expected: "expected value",
        detection: "automated",
        failed: score !== null && score <= 70,
      },
    ],
    findings,
  };
}

const project = {
  id: "p1",
  workspaceId: "w1",
  name: "Meridian Bank",
  description: "Online banking dashboard.",
  websiteUrl: "https://app.example.com",
  projectType: "banking",
  industry: "Financial services",
  targetAudience: "Retail customers",
  objectives: JSON.stringify(["Meet WCAG 2.2 AA"]),
  priorities: JSON.stringify(["accessibility"]),
  referenceTokens: null,
  archived: false,
  createdAt: now,
  updatedAt: now,
} as unknown as Project;

function audit(overrides: Partial<Audit> = {}): Audit {
  const scores = {
    accessibility: categoryScore("accessibility", 48),
    usability: categoryScore("usability", 72),
    content: categoryScore("content", null, 0),
  };
  return {
    id: "a1",
    projectId: "p1",
    pageId: "pg1",
    name: "Transfer flow audit",
    description: "Post-redesign review",
    targetUrl: "https://app.example.com/transfer",
    status: "completed",
    scope: JSON.stringify(["accessibility", "usability", "content"]),
    context: JSON.stringify({ viewport: "all", objectives: ["Confirm WCAG AA"] }),
    categoryScores: JSON.stringify(scores),
    metrics: JSON.stringify({
      finalUrl: "https://app.example.com/transfer",
      performance: { loadEventMs: 2100, requestCount: 64, transferKb: 1800 },
      axe: { violations: 2, nodes: 5 },
    }),
    stages: null,
    comparison: JSON.stringify({
      previousAuditName: "Baseline audit",
      previousScore: 60,
      delta: -3,
      categories: [{ category: "accessibility", current: 48, previous: 51, delta: -3 }],
    }),
    overallScore: 57,
    error: null,
    screenshotUrl: null,
    durationMs: 8400,
    isSample: false,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    ...overrides,
  } as unknown as Audit;
}

const findings = [
  {
    id: "f1",
    auditId: "a1",
    projectId: "p1",
    title: "Form controls lack labels",
    description: "Two inputs have no accessible name.",
    category: "accessibility",
    severity: "critical",
    status: "open",
    detection: "automated",
    evidence: "2 of 6 controls unnamed",
    whyItMatters: "Screen readers cannot identify the fields.",
    recommendation: "Add visible labels.",
    implementation: '<label for="amount">Amount</label>',
    pageUrl: "https://app.example.com/transfer",
    selector: null,
    wcagCriterion: "WCAG 2.2 SC 3.3.2",
    affectedCount: 2,
    screenshotUrl: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "f2",
    auditId: "a1",
    projectId: "p1",
    title: "Body text is small",
    description: "Median body size is 13px.",
    category: "visual-design",
    severity: "medium",
    status: "open",
    detection: "automated",
    evidence: "median 13px",
    whyItMatters: "Fatigue.",
    recommendation: "Raise to 16px.",
    implementation: "body { font-size: 1rem }",
    pageUrl: null,
    selector: null,
    wcagCriterion: null,
    affectedCount: null,
    screenshotUrl: null,
    createdAt: now,
    updatedAt: now,
  },
] as unknown as Finding[];

test("buildReportModel maps scores, scope and findings", () => {
  const model = buildReportModel({ project, audit: audit(), findings });

  assert.equal(model.product.name, "DesignLens");
  assert.equal(model.project.typeLabel, "Banking dashboard");
  assert.equal(model.overview.overallScore, 57);
  assert.equal(model.overview.grade, "Weak");
  assert.equal(model.overview.evaluatedCategories, 2);
  assert.equal(model.overview.selectedCategories, 3);
  assert.equal(model.overview.findings, 2);
  assert.equal(model.overview.severityCounts.critical, 1);
  assert.equal(model.overview.severityCounts.medium, 1);

  assert.deepEqual(
    model.scores.map((score) => [score.category, score.score]),
    [
      ["accessibility", 48],
      ["usability", 72],
      ["content", null],
    ],
  );

  // Checks are flattened from every evaluated category.
  assert.equal(model.checks.length, 3);
  assert.equal(model.keyFindings[0].title, "Form controls lack labels");
  assert.equal(model.accessibilityFindings.length, 1);
  assert.equal(model.visualFindings.length, 1);
  assert.equal(model.comparison?.delta, -3);
});

test("executive summary states the weakest dimension and the score", () => {
  const model = buildReportModel({ project, audit: audit(), findings });
  const summary = model.executiveSummary.join(" ");

  assert.match(summary, /57\/100/);
  assert.match(summary, /Accessibility/);
  assert.match(summary, /weakest/);
});

test("report handles an audit without findings", () => {
  const model = buildReportModel({ project, audit: audit(), findings: [] });

  assert.equal(model.keyFindings.length, 0);
  assert.equal(model.overview.findings, 0);
  assert.match(model.executiveSummary.join(" "), /No automated checks failed/);
  assert.equal(model.priorities.length, 0);
  assert.equal(model.roadmap.length, 0);
});

test("report handles missing comparison data without inventing one", () => {
  const model = buildReportModel({ project, audit: audit({ comparison: null }), findings });
  assert.equal(model.comparison, null);
});

test("roadmap and priorities follow severity order", () => {
  const model = buildReportModel({ project, audit: audit(), findings });
  assert.equal(model.priorities[0].horizon, "Now (this sprint)");
  assert.equal(model.priorities[0].items[0], "Form controls lack labels");
  assert.equal(model.roadmap[0].phase, "Phase 1 — Stabilise");
});

test("scores that were not evaluated stay null rather than defaulting to zero", () => {
  const model = buildReportModel({ project, audit: audit(), findings });
  const content = model.scores.find((score) => score.category === "content");
  assert.equal(content?.score, null);
  assert.equal(content?.automatedChecks, 6);
});
