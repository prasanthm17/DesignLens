import { CATEGORY_META, SEVERITY_META } from "@shared/catalog";
import type { AuditCategory, SeverityLevel } from "@shared/schema";

export type CheckStatus = "pass" | "warn" | "fail" | "na";

export interface FindingDraft {
  title: string;
  description: string;
  category: AuditCategory;
  severity: SeverityLevel;
  evidence?: string | null;
  whyItMatters?: string | null;
  recommendation?: string | null;
  implementation?: string | null;
  selector?: string | null;
  wcagCriterion?: string | null;
  affectedCount?: number | null;
}

export interface AuditCheck {
  id: string;
  label: string;
  category: AuditCategory;
  status: CheckStatus;
  /** Relative importance of the check inside its category. */
  weight: number;
  observed: string;
  expected: string;
  /** "automated" checks feed the score. "manual" checks are prompts for a human and never score. */
  detection: "automated" | "manual";
  finding?: FindingDraft;
}

export interface CategoryScore {
  category: AuditCategory;
  /** null means the category was not evaluated at all. */
  score: number | null;
  passedWeight: number;
  totalWeight: number;
  automatedChecks: number;
  manualChecks: number;
  checks: Array<Omit<AuditCheck, "finding"> & { failed: boolean }>;
  findings: number;
}

const STATUS_FACTOR: Record<CheckStatus, number | null> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
  na: null,
};

export function scoreCategory(category: AuditCategory, checks: AuditCheck[]): CategoryScore {
  const scored = checks.filter((check) => check.detection === "automated" && STATUS_FACTOR[check.status] !== null);
  const totalWeight = scored.reduce((sum, check) => sum + check.weight, 0);
  const passedWeight = scored.reduce((sum, check) => sum + check.weight * (STATUS_FACTOR[check.status] as number), 0);

  return {
    category,
    score: totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : null,
    passedWeight: round(passedWeight, 2),
    totalWeight: round(totalWeight, 2),
    automatedChecks: checks.filter((c) => c.detection === "automated").length,
    manualChecks: checks.filter((c) => c.detection === "manual").length,
    checks: checks.map(({ finding, ...rest }) => ({ ...rest, failed: rest.status === "fail" || rest.status === "warn" })),
    findings: checks.filter((check) => check.finding && (check.status === "fail" || check.status === "warn")).length,
  };
}

export function scoreAudit(categoryScores: CategoryScore[]): {
  overall: number | null;
  evaluated: AuditCategory[];
  weights: Record<string, number>;
} {
  const evaluated = categoryScores.filter((entry) => entry.score !== null);
  if (evaluated.length === 0) return { overall: null, evaluated: [], weights: {} };

  const totalWeight = evaluated.reduce((sum, entry) => sum + CATEGORY_META[entry.category].weight, 0) || 1;
  const weights: Record<string, number> = {};
  let overall = 0;

  for (const entry of evaluated) {
    const weight = CATEGORY_META[entry.category].weight / totalWeight;
    weights[entry.category] = round(weight, 4);
    overall += (entry.score as number) * weight;
  }

  return { overall: Math.round(overall), evaluated: evaluated.map((entry) => entry.category), weights };
}

/** Severity nudge for a failing check: heavier checks break more of the experience. */
export function severityForWeight(weight: number): SeverityLevel {
  if (weight >= 3) return "critical";
  if (weight >= 2) return "high";
  if (weight >= 1) return "medium";
  if (weight >= 0.5) return "low";
  return "informational";
}

export function gradeLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) return "Not evaluated";
  if (score >= 90) return "Excellent";
  if (score >= 78) return "Strong";
  if (score >= 62) return "Fair";
  if (score >= 45) return "Weak";
  return "Critical";
}

export function deltaTone(delta: number | null | undefined): "up" | "down" | "flat" {
  if (!delta) return "flat";
  return delta > 0 ? "up" : "down";
}

export function compareToPrevious(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return current - previous;
}

export function severityRank(severity: string): number {
  return SEVERITY_META[severity as SeverityLevel]?.order ?? 9;
}

export function sortBySeverity<T extends { severity: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

export function countBySeverity(items: Array<{ severity: string }>): Record<SeverityLevel, number> {
  const counts: Record<SeverityLevel, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };
  for (const item of items) {
    const key = item.severity as SeverityLevel;
    if (key in counts) counts[key] += 1;
  }
  return counts;
}

/** Remediation impact estimate used by the report roadmap. */
export function remediationImpact(severityCounts: Record<SeverityLevel, number>, evaluatedCategories: number): number {
  if (evaluatedCategories === 0) return 0;
  const drag =
    severityCounts.critical * 9 +
    severityCounts.high * 5 +
    severityCounts.medium * 2.2 +
    severityCounts.low * 1 +
    severityCounts.informational * 0.3;
  return Math.min(40, Math.round(drag / evaluatedCategories));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
