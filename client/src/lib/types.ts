export type AuditCategory =
  | "usability"
  | "accessibility"
  | "visual-design"
  | "responsive"
  | "content"
  | "performance"
  | "consistency";

export type Severity = "critical" | "high" | "medium" | "low" | "informational";
export type FindingStatus = "open" | "in-review" | "resolved" | "wont-fix";
export type AuditStatus = "queued" | "running" | "completed" | "failed" | "archived";
export type StageStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface CategoryMeta {
  key: AuditCategory;
  label: string;
  short: string;
  weight: number;
  description: string;
  checks: string[];
}

export interface Catalog {
  categories: CategoryMeta[];
  projectTypes: Array<{ key: string; label: string }>;
  audiences: string[];
  viewports: Array<{ key: string; label: string; detail: string }>;
  methodology: string[];
}

export interface MeResponse {
  mode: "user" | "demo" | "anonymous";
  user: { id: string; email: string; name: string } | null;
  workspace: { id: string; name: string } | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  projectType: string;
  projectTypeLabel: string;
  industry: string | null;
  targetAudience: string | null;
  archived: boolean;
  pageCount: number;
  auditCount: number;
  openFindings: number;
  latestScore: number | null;
  lastAuditedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AuditSummary {
  id: string;
  projectId: string;
  pageId: string | null;
  name: string;
  description: string | null;
  targetUrl: string;
  status: AuditStatus;
  scope: AuditCategory[];
  overallScore: number | null;
  grade: string;
  error: string | null;
  screenshotUrl: string | null;
  durationMs: number | null;
  isSample: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  projectName?: string;
}

export interface Finding {
  id: string;
  auditId: string;
  projectId: string;
  title: string;
  description: string;
  category: AuditCategory;
  severity: Severity;
  status: FindingStatus;
  detection: "automated" | "manual";
  evidence: string | null;
  whyItMatters: string | null;
  recommendation: string | null;
  implementation: string | null;
  pageUrl: string | null;
  selector: string | null;
  wcagCriterion: string | null;
  affectedCount: number | null;
  screenshotUrl: string | null;
  createdAt: string | null;
  projectName?: string;
}

export interface CheckResult {
  id: string;
  label: string;
  category: AuditCategory;
  status: "pass" | "warn" | "fail" | "na";
  weight: number;
  observed: string;
  expected: string;
  detection: "automated" | "manual";
  failed: boolean;
}

export interface CategoryScore {
  category: AuditCategory;
  score: number | null;
  passedWeight: number;
  totalWeight: number;
  automatedChecks: number;
  manualChecks: number;
  checks: CheckResult[];
  findings: number;
}

export interface AuditStage {
  key: string;
  label: string;
  status: StageStatus;
  detail?: string | null;
  durationMs?: number | null;
  startedAt?: string | null;
}

export interface DashboardData {
  mode: "user" | "demo";
  totals: {
    projects: number;
    audits: number;
    completedAudits: number;
    averageScore: number | null;
    criticalFindings: number;
    openFindings: number;
    resolvedFindings: number;
    scoreDelta: number | null;
  };
  categoryAverages: Array<{ category: AuditCategory; score: number; audits: number }>;
  trend: Array<{ date: string; score: number; auditName: string }>;
  severityDistribution: Record<Severity, number>;
  recentAudits: AuditSummary[];
  projects: ProjectSummary[];
}

export interface ProjectDetail {
  project: ProjectSummary;
  objectives: string[];
  priorities: AuditCategory[];
  referenceTokens: Record<string, unknown> | null;
  pages: Array<{
    id: string;
    projectId: string;
    name: string;
    url: string;
    notes: string | null;
    audits: number;
    latestScore: number | null;
  }>;
  audits: AuditSummary[];
  findings: { total: number; open: number; resolved: number; bySeverity: Record<string, number> };
  stats: { auditCount: number; completedAudits: number; averageScore: number | null; bestScore: number | null };
  history: Array<{ id: string; name: string; score: number | null; date: string | null }>;
}

export interface AuditDetail {
  audit: AuditSummary;
  project: ProjectSummary;
  scope: AuditCategory[];
  context: { targetAudience?: string | null; objectives?: string[]; priorities?: AuditCategory[]; viewport?: string };
  stages: AuditStage[];
  categoryScores: Record<string, CategoryScore>;
  metrics: Record<string, unknown>;
  comparison: {
    previousAuditId?: string;
    previousAuditName?: string;
    previousScore?: number | null;
    currentScore?: number | null;
    delta?: number | null;
    categories?: Array<{ category: AuditCategory; current: number | null; previous: number | null; delta: number | null }>;
  } | null;
  findings: Finding[];
  grade: string;
}

export interface AuditStatusResponse {
  id: string;
  status: AuditStatus;
  stages: AuditStage[];
  overallScore: number | null;
  error: string | null;
  durationMs: number | null;
}
