import { mkdir } from "fs/promises";
import { join } from "path";
import type { Audit, AuditCategory, ViewportPreset } from "@shared/schema";
import { CATEGORY_META } from "@shared/catalog";
import { storage, parseJson } from "../storage";
import { buildChecks, type ReferenceTokens } from "./checks";
import { capturePage, type PageCapture } from "./capture";
import { scoreAudit, scoreCategory, type CategoryScore } from "../lib/scoring";
import { readability, distinctValues, median } from "../lib/signals";

export type StageStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface AuditStage {
  key: string;
  label: string;
  status: StageStatus;
  detail?: string | null;
  startedAt?: string | null;
  durationMs?: number | null;
}

export const STAGE_TEMPLATE: Array<{ key: string; label: string }> = [
  { key: "resolve", label: "Resolve target and scope" },
  { key: "navigate", label: "Load target page" },
  { key: "capture", label: "Capture structure, styles and screenshot" },
  { key: "axe", label: "Run accessibility rule engine" },
  { key: "responsive", label: "Measure responsive breakpoints" },
  { key: "analyse", label: "Evaluate audit categories" },
  { key: "findings", label: "Generate findings and recommendations" },
  { key: "score", label: "Calculate design quality score" },
  { key: "compare", label: "Compare with previous audit" },
  { key: "report", label: "Prepare audit report" },
];

export function initialStages(scope: AuditCategory[]): AuditStage[] {
  return STAGE_TEMPLATE.map((stage) => ({
    ...stage,
    status: stage.key === "axe" && !scope.includes("accessibility")
      ? "skipped"
      : stage.key === "responsive" && !scope.includes("responsive")
        ? "skipped"
        : "pending",
    detail: null,
    startedAt: null,
    durationMs: null,
  }));
}

export interface RunAuditParams {
  audit: Audit;
  scope: AuditCategory[];
  viewport: ViewportPreset;
  referenceTokens?: ReferenceTokens | null;
  screenshotDir: string;
  onProgress?: (stages: AuditStage[], patch: Partial<Audit>) => Promise<void> | void;
}

export interface RunAuditResult {
  stages: AuditStage[];
  categoryScores: CategoryScore[];
  overall: number | null;
  findingsCreated: number;
  metrics: Record<string, unknown>;
  comparison: Record<string, unknown> | null;
  screenshotUrl: string | null;
  durationMs: number;
}

/**
 * Executes a real audit: renders the page in headless Chromium, measures it,
 * derives checks, scores them and persists the findings.
 *
 * Stage reporting is driven by the work actually being performed, so the UI
 * can never show a stage that did not run.
 */
export async function runAudit(params: RunAuditParams): Promise<RunAuditResult> {
  const { audit, scope } = params;
  const stages = initialStages(scope);
  const startedAt = Date.now();

  const mark = async (key: string, status: StageStatus, detail?: string | null) => {
    const stage = stages.find((entry) => entry.key === key);
    if (!stage) return;
    if (status === "running") stage.startedAt = new Date().toISOString();
    if ((status === "done" || status === "failed" || status === "skipped") && stage.startedAt) {
      stage.durationMs = Date.now() - new Date(stage.startedAt).getTime();
    }
    stage.status = status;
    if (detail !== undefined) stage.detail = detail;
    await params.onProgress?.(stages, { stages: JSON.stringify(stages) });
  };

  try {
    await mark("resolve", "running");
    await mark("resolve", "done", `${scope.length} categories · ${scope.map((category) => CATEGORY_META[category].label).join(", ")}`);

    await mark("navigate", "running");
    let capture: PageCapture;
    try {
      capture = await capturePage(audit.targetUrl, {
        screenshotDir: params.screenshotDir,
        auditId: audit.id,
        viewportPreset: params.viewport,
        needsResponsive: scope.includes("responsive"),
        onStage: async (stage, detail) => {
          if (stage === "navigating") return;
          if (stage === "capturing") await mark("capture", "running", detail ?? null);
          if (stage === "axe") await mark("capture", "done", detail ?? "Structure and styles captured");
          if (stage === "responsive") {
            await mark("navigate", "done", detail ? `Loaded · ${detail}` : "Loaded");
            await mark("capture", "done", "Structure and styles captured");
            await mark("axe", scope.includes("accessibility") ? "done" : "skipped", detail ?? null);
            await mark("responsive", "running", detail ?? null);
          }
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The page could not be loaded";
      await mark("navigate", "failed", message);
      throw error;
    }

    await mark("navigate", "done", `HTTP 200 · ${capture.finalUrl}`);
    await mark("capture", "done", `${capture.dom.domNodes} DOM nodes · screenshot captured`);
    await mark(
      "axe",
      scope.includes("accessibility") ? "done" : "skipped",
      scope.includes("accessibility")
        ? `${capture.axe.length} rule violation(s) across WCAG 2.2 A–AA`
        : "Accessibility not in scope",
    );
    await mark(
      "responsive",
      scope.includes("responsive") ? "done" : "skipped",
      scope.includes("responsive")
        ? capture.responsive.map((entry) => `${entry.width}px:${entry.overflow ? `+${entry.overflowPx}px` : "ok"}`).join(" · ")
        : "Responsive not in scope",
    );

    await mark("analyse", "running");
    const { checks } = buildChecks(capture, scope, { referenceTokens: params.referenceTokens ?? null });
    const categoryScores = scope.map((category) =>
      scoreCategory(category, checks.filter((check) => check.category === category)),
    );
    await mark(
      "analyse",
      "done",
      `${checks.filter((check) => check.detection === "automated").length} automated checks · ${checks.filter((check) => check.detection === "manual").length} manual prompts`,
    );

    await mark("findings", "running");
    const drafted = checks.filter(
      (check) => check.finding && (check.status === "fail" || check.status === "warn"),
    );
    const findingRows = drafted.map((check) => ({
      auditId: audit.id,
      projectId: audit.projectId,
      title: check.finding!.title,
      description: check.finding!.description,
      category: check.category,
      severity: check.finding!.severity,
      status: "open" as const,
      detection: check.detection,
      evidence: check.finding!.evidence ?? check.observed,
      whyItMatters: check.finding!.whyItMatters ?? null,
      recommendation: check.finding!.recommendation ?? null,
      implementation: check.finding!.implementation ?? null,
      pageUrl: capture.finalUrl,
      selector: check.finding!.selector ?? null,
      wcagCriterion: check.finding!.wcagCriterion ?? null,
      affectedCount: check.finding!.affectedCount ?? null,
      screenshotUrl: capture.screenshotUrl,
    }));

    const severityOrder = ["critical", "high", "medium", "low", "informational"];
    findingRows.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));

    if (findingRows.length > 0) {
      await storage.createFindings(findingRows);
    }
    await mark("findings", "done", `${findingRows.length} finding(s) generated`);

    await mark("score", "running");
    const { overall, weights } = scoreAudit(categoryScores);
    await mark("score", "done", overall === null ? "No evaluable categories" : `Overall ${overall}/100`);

    await mark("compare", "running");
    const previous = await storage.previousCompletedAudit(audit);
    const comparison = buildComparison(overall, categoryScores, previous);
    await mark(
      "compare",
      "done",
      previous ? `Compared with "${previous.name}"` : "First audit for this target",
    );

    const metrics = buildMetrics(capture, categoryScores, weights);
    const durationMs = Date.now() - startedAt;

    await mark("report", "running");
    await storage.updateAudit(audit.id, {
      status: "completed",
      overallScore: overall,
      categoryScores: JSON.stringify(Object.fromEntries(categoryScores.map((entry) => [entry.category, entry]))),
      metrics: JSON.stringify(metrics),
      stages: JSON.stringify(stages),
      comparison: comparison ? JSON.stringify(comparison) : null,
      screenshotUrl: capture.screenshotUrl,
      durationMs,
      completedAt: new Date(),
      error: null,
    });
    await mark("report", "done", `Report ready · ${(durationMs / 1000).toFixed(1)}s`);

    return {
      stages,
      categoryScores,
      overall,
      findingsCreated: findingRows.length,
      metrics,
      comparison,
      screenshotUrl: capture.screenshotUrl,
      durationMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audit failed";
    const running = stages.find((stage) => stage.status === "running");
    if (running) running.status = "failed";
    await storage.updateAudit(audit.id, {
      status: "failed",
      error: message,
      stages: JSON.stringify(stages),
      completedAt: new Date(),
    });
    throw error;
  }
}

function buildComparison(
  currentOverall: number | null,
  categoryScores: CategoryScore[],
  previous: Audit | null,
): Record<string, unknown> | null {
  if (!previous) return null;

  const previousScores = parseJson<Record<string, CategoryScore>>(previous.categoryScores, {});
  const categories = categoryScores
    .filter((entry) => entry.score !== null)
    .map((entry) => {
      const before = previousScores[entry.category]?.score ?? null;
      return {
        category: entry.category,
        current: entry.score,
        previous: before,
        delta: before !== null && entry.score !== null ? entry.score - before : null,
      };
    });

  return {
    previousAuditId: previous.id,
    previousAuditName: previous.name,
    previousCompletedAt: previous.completedAt,
    previousScore: previous.overallScore,
    currentScore: currentOverall,
    delta:
      currentOverall !== null && previous.overallScore !== null
        ? currentOverall - previous.overallScore
        : null,
    categories,
  };
}

function buildMetrics(
  capture: PageCapture,
  categoryScores: CategoryScore[],
  weights: Record<string, number>,
): Record<string, unknown> {
  const reading = readability(capture.dom.bodyText);
  return {
    finalUrl: capture.finalUrl,
    pageTitle: capture.dom.title,
    lang: capture.dom.lang,
    metaDescription: capture.dom.metaDescription,
    viewportMeta: capture.dom.viewportMeta,
    counts: capture.dom.counts,
    landmarks: capture.dom.landmarks,
    performance: capture.performance,
    axe: {
      violations: capture.axe.length,
      nodes: capture.axe.reduce((sum, violation) => sum + violation.nodes, 0),
      rules: capture.axe.slice(0, 25),
    },
    responsive: capture.responsive,
    focus: capture.dom.focus,
    typography: {
      families: distinctValues(capture.dom.styles.map((style) => style.family), 8),
      sizes: distinctValues(capture.dom.styles.map((style) => `${style.size}px`), 12),
      medianBodySize: median(capture.dom.styles.filter((s) => s.size >= 10 && s.size <= 30).map((s) => s.size)),
    },
    palette: {
      text: distinctValues(capture.dom.textColors, 10),
      surface: distinctValues(capture.dom.backgroundColors, 10),
      radius: distinctValues(capture.dom.radii, 10),
      shadows: distinctValues(capture.dom.shadows, 8),
    },
    readability: reading,
    weights,
    evaluatedCategories: categoryScores.filter((entry) => entry.score !== null).length,
    capturedAt: capture.capturedAt,
    screenshotUrl: capture.screenshotUrl,
  };
}

/** Ensures the screenshot directory exists (called once at boot). */
export async function ensureScreenshotDir(dir: string): Promise<string> {
  await mkdir(join(dir), { recursive: true });
  return dir;
}
