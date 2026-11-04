import { CATEGORY_META, METHODOLOGY_NOTES, PROJECT_TYPE_LABELS } from "@shared/catalog";
import type { Audit, AuditCategory, Finding, Project, SeverityLevel } from "@shared/schema";
import type { CategoryScore } from "./scoring";
import { countBySeverity, gradeLabel, remediationImpact, severityRank } from "./scoring";
import { parseJson } from "./json";

export interface ReportModel {
  product: { name: string; tagline: string; generatedAt: string };
  project: {
    name: string;
    description: string | null;
    type: string;
    typeLabel: string;
    targetAudience: string | null;
    websiteUrl: string | null;
  };
  audit: {
    id: string;
    name: string;
    description: string | null;
    targetUrl: string;
    finalUrl: string;
    status: string;
    completedAt: string | null;
    durationMs: number | null;
    viewport: string | null;
  };
  overview: {
    overallScore: number | null;
    grade: string;
    evaluatedCategories: number;
    selectedCategories: number;
    findings: number;
    severityCounts: Record<SeverityLevel, number>;
    estimatedHeadroom: number;
  };
  scope: Array<{ key: string; label: string; weight: number; notes: string[] }>;
  scores: Array<{
    category: string;
    label: string;
    score: number | null;
    weight: number;
    automatedChecks: number;
    manualChecks: number;
    findings: number;
  }>;
  methodology: string[];
  checks: Array<{
    category: string;
    label: string;
    status: string;
    observed: string;
    expected: string;
    detection: string;
  }>;
  executiveSummary: string[];
  keyFindings: Array<ReportFinding>;
  criticalIssues: Array<ReportFinding>;
  accessibilityFindings: Array<ReportFinding>;
  visualFindings: Array<ReportFinding>;
  recommendations: Array<{ title: string; action: string; category: string; severity: string }>;
  priorities: Array<{ horizon: string; items: string[] }>;
  roadmap: Array<{ phase: string; timeframe: string; focus: string; items: string[] }>;
  comparison: {
    previousAuditName: string;
    previousScore: number | null;
    delta: number | null;
    categories: Array<{ category: string; label: string; current: number | null; previous: number | null; delta: number | null }>;
  } | null;
  evidence: {
    screenshotUrl: string | null;
    metrics: Record<string, unknown>;
  };
}

export interface ReportFinding {
  title: string;
  severity: string;
  category: string;
  categoryLabel: string;
  evidence: string | null;
  whyItMatters: string | null;
  recommendation: string | null;
  implementation: string | null;
  wcagCriterion?: string | null;
  affectedCount?: number | null;
}

export function buildReportModel(input: {
  project: Project;
  audit: Audit;
  findings: Finding[];
  pages?: number;
}): ReportModel {
  const { project, audit, findings } = input;

  const categoryScores = parseJson<Record<string, CategoryScore>>(audit.categoryScores, {});
  const metrics = parseJson<Record<string, unknown>>(audit.metrics, {});
  const comparisonRaw = parseJson<{
    previousAuditName?: string;
    previousScore?: number | null;
    delta?: number | null;
    categories?: Array<{ category: string; current: number | null; previous: number | null; delta: number | null }>;
  } | null>(audit.comparison, null);

  const selectedScope = parseJson<AuditCategory[]>(audit.scope, []);
  const evaluated = Object.values(categoryScores).filter((entry) => entry.score !== null);
  const severityCounts = countBySeverity(findings);
  const grade = gradeLabel(audit.overallScore);

  const keyFindings = [...findings]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 8)
    .map(toReportFinding);

  const criticalIssues = findings
    .filter((finding) => finding.severity === "critical" || finding.severity === "high")
    .map(toReportFinding);

  const accessibilityFindings = findings
    .filter((finding) => finding.category === "accessibility")
    .map(toReportFinding);

  const visualFindings = findings
    .filter((finding) => finding.category === "visual-design" || finding.category === "consistency")
    .map(toReportFinding);

  const headroom = remediationImpact(severityCounts, Math.max(1, evaluated.length));

  return {
    product: {
      name: "DesignLens",
      tagline: "See beyond the interface. Improve every experience.",
      generatedAt: new Date().toISOString(),
    },
    project: {
      name: project.name,
      description: project.description,
      type: project.projectType,
      typeLabel: PROJECT_TYPE_LABELS[project.projectType as keyof typeof PROJECT_TYPE_LABELS] ?? project.projectType,
      targetAudience: project.targetAudience,
      websiteUrl: project.websiteUrl,
    },
    audit: {
      id: audit.id,
      name: audit.name,
      description: audit.description,
      targetUrl: audit.targetUrl,
      finalUrl: (metrics.finalUrl as string | undefined) ?? audit.targetUrl,
      status: audit.status,
      completedAt: audit.completedAt ? new Date(audit.completedAt).toISOString() : null,
      durationMs: audit.durationMs,
      viewport: parseJson<{ viewport?: string }>(audit.context, {}).viewport ?? null,
    },
    overview: {
      overallScore: audit.overallScore,
      grade,
      evaluatedCategories: evaluated.length,
      selectedCategories: selectedScope.length,
      findings: findings.length,
      severityCounts,
      estimatedHeadroom: headroom,
    },
    scope: selectedScope.map((category) => ({
      key: category,
      label: CATEGORY_META[category]?.label ?? category,
      weight: CATEGORY_META[category]?.weight ?? 0,
      notes: CATEGORY_META[category]?.checks ?? [],
    })),
    scores: selectedScope.map((category) => {
      const entry = categoryScores[category];
      return {
        category,
        label: CATEGORY_META[category]?.label ?? category,
        score: entry?.score ?? null,
        weight: CATEGORY_META[category]?.weight ?? 0,
        automatedChecks: entry?.automatedChecks ?? 0,
        manualChecks: entry?.manualChecks ?? 0,
        // Count from the findings list rather than a stored counter, so the
        // report can never disagree with the findings it lists.
        findings: findings.filter((finding) => finding.category === category).length,
      };
    }),
    methodology: METHODOLOGY_NOTES,
    checks: Object.values(categoryScores).flatMap((entry) =>
      entry.checks.map((check) => ({
        category: entry.category,
        label: check.label,
        status: check.status,
        observed: check.observed,
        expected: check.expected,
        detection: check.detection,
      })),
    ),
    executiveSummary: buildExecutiveSummary(audit, findings, evaluated.length, selectedScope.length, grade),
    keyFindings,
    criticalIssues,
    accessibilityFindings,
    visualFindings,
    recommendations: findings
      .filter((finding) => finding.recommendation)
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
      .slice(0, 12)
      .map((finding) => ({
        title: finding.title,
        action: finding.recommendation as string,
        category: finding.category,
        severity: finding.severity,
      })),
    priorities: buildPriorities(findings),
    roadmap: buildRoadmap(findings),
    comparison: comparisonRaw
      ? {
          previousAuditName: comparisonRaw.previousAuditName ?? "Previous audit",
          previousScore: comparisonRaw.previousScore ?? null,
          delta: comparisonRaw.delta ?? null,
          categories: (comparisonRaw.categories ?? []).map((entry) => ({
            ...entry,
            label: CATEGORY_META[entry.category as AuditCategory]?.label ?? entry.category,
          })),
        }
      : null,
    evidence: {
      screenshotUrl: audit.screenshotUrl,
      metrics,
    },
  };
}

function toReportFinding(finding: Finding): ReportFinding {
  return {
    title: finding.title,
    severity: finding.severity,
    category: finding.category,
    categoryLabel: CATEGORY_META[finding.category as AuditCategory]?.label ?? finding.category,
    evidence: finding.evidence,
    whyItMatters: finding.whyItMatters,
    recommendation: finding.recommendation,
    implementation: finding.implementation,
    wcagCriterion: finding.wcagCriterion,
    affectedCount: finding.affectedCount,
  };
}

function buildExecutiveSummary(
  audit: Audit,
  findings: Finding[],
  evaluated: number,
  selected: number,
  grade: string,
): string[] {
  const score = audit.overallScore;
  const lines: string[] = [];

  if (score === null) {
    lines.push("This audit did not produce a score because no category could be evaluated.");
  } else {
    lines.push(
      `The audited page scores ${score}/100 (${grade}) across ${evaluated} evaluated ${
        evaluated === 1 ? "category" : "categories"
      }${selected > evaluated ? ` of ${selected} selected` : ""}.`,
    );
  }

  const critical = findings.filter((finding) => finding.severity === "critical").length;
  const high = findings.filter((finding) => finding.severity === "high").length;
  if (findings.length === 0) {
    lines.push("No automated checks failed. Manual review is still required for the prompts listed in the methodology.");
  } else {
    lines.push(
      `${findings.length} finding${findings.length === 1 ? "" : "s"} were recorded, of which ${critical} critical and ${high} high severity.`,
    );
  }

  const weakest = audit.categoryScores
    ? Object.values(JSON.parse(audit.categoryScores) as Record<string, CategoryScore>)
        .filter((entry) => entry.score !== null)
        .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0]
    : undefined;
  if (weakest) {
    lines.push(
      `The weakest area is ${CATEGORY_META[weakest.category]?.label ?? weakest.category} at ${weakest.score}/100, which is where remediation effort will pay back fastest.`,
    );
  }

  const topActions = findings
    .filter((finding) => finding.recommendation && (finding.severity === "critical" || finding.severity === "high"))
    .slice(0, 3)
    .map((finding) => finding.recommendation as string);
  if (topActions.length) {
    lines.push(`Priority actions: ${topActions.join(" ")}`);
  }

  return lines;
}

function buildPriorities(findings: Finding[]): Array<{ horizon: string; items: string[] }> {
  const byHorizon = (severities: string[]) =>
    findings
      .filter((finding) => severities.includes(finding.severity))
      .slice(0, 5)
      .map((finding) => finding.title);

  return [
    { horizon: "Now (this sprint)", items: byHorizon(["critical", "high"]) },
    { horizon: "Next (2–4 weeks)", items: byHorizon(["medium"]) },
    { horizon: "Later (backlog)", items: byHorizon(["low", "informational"]) },
  ].filter((group) => group.items.length > 0);
}

function buildRoadmap(findings: Finding[]): ReportModel["roadmap"] {
  const bucket = (severities: string[], categories?: string[]) =>
    findings
      .filter((finding) => severities.includes(finding.severity))
      .filter((finding) => !categories || categories.includes(finding.category))
      .slice(0, 6)
      .map((finding) => finding.title);

  const phases = [
    {
      phase: "Phase 1 — Stabilise",
      timeframe: "Week 1",
      focus: "Blocking accessibility and usability defects",
      items: bucket(["critical"]),
    },
    {
      phase: "Phase 2 — Correct",
      timeframe: "Weeks 2–3",
      focus: "High-severity findings and responsive breakage",
      items: bucket(["high"]),
    },
    {
      phase: "Phase 3 — Refine",
      timeframe: "Month 2",
      focus: "Visual consistency, typography and spacing systems",
      items: bucket(["medium"]),
    },
    {
      phase: "Phase 4 — Polish",
      timeframe: "Ongoing",
      focus: "Low-severity and informational improvements",
      items: bucket(["low", "informational"]),
    },
  ];

  return phases.filter((phase) => phase.items.length > 0);
}
