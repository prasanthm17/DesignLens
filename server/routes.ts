import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  auditCategories,
  createAuditRequestSchema,
  findingPatchSchema,
  projectTypes,
  viewportPresets,
  type AuditCategory,
  type Project,
  type ViewportPreset,
} from "@shared/schema";
import { AUDIENCE_PRESETS, CATEGORY_META, METHODOLOGY_NOTES, PROJECT_TYPE_LABELS, VIEWPORT_META } from "@shared/catalog";
import { storage, parseJson } from "./storage";
import { requireAuth, requireWritable } from "./auth";
import { runAudit, type AuditStage } from "./services/auditRunner";
import { assertPublicTarget } from "./services/capture";
import type { ReferenceTokens } from "./services/checks";
import { gradeLabel } from "./lib/scoring";
import { buildReportModel } from "./lib/report";
import { renderReportHtml } from "./lib/reportHtml";

const running = new Set<string>();

export async function registerRoutes(_httpServer: Server, app: Express): Promise<Server> {
  const publicDir = join(process.cwd(), "public");
  const screenshotDir = join(publicDir, "screenshots");

  app.use("/api", (_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });

  /* ------------------------------- catalog ------------------------------ */

  app.get("/api/catalog", (_req, res) => {
    res.json({
      categories: auditCategories.map((key) => ({
        key,
        ...CATEGORY_META[key],
      })),
      projectTypes: projectTypes.map((key) => ({ key, label: PROJECT_TYPE_LABELS[key] })),
      audiences: AUDIENCE_PRESETS,
      viewports: viewportPresets.map((key) => ({
        key,
        label: key === "all" ? "All breakpoints" : VIEWPORT_META[key as "desktop" | "tablet" | "mobile"].label,
        detail:
          key === "all"
            ? "Desktop, tablet and mobile"
            : `${VIEWPORT_META[key as "desktop" | "tablet" | "mobile"].width}px wide`,
      })),
      methodology: METHODOLOGY_NOTES,
    });
  });

  /* ------------------------------ dashboard ----------------------------- */

  app.get("/api/dashboard", requireAuth, async (_req, res) => {
    const workspaceId = res.locals.workspaceId as string;
    const metrics = await storage.dashboardMetrics(workspaceId);

    res.json({
      mode: res.locals.mode,
      totals: metrics.totals,
      categoryAverages: metrics.categoryAverages,
      trend: metrics.trend,
      severityDistribution: metrics.severityDistribution,
      recentAudits: metrics.recentAudits.map(serializeAudit),
      projects: metrics.projects.slice(0, 6).map(serializeProject),
    });
  });

  /* ------------------------------- projects ----------------------------- */

  app.get("/api/projects", requireAuth, async (req, res) => {
    const includeArchived = req.query.archived === "1";
    const rows = await storage.listProjects(res.locals.workspaceId as string, includeArchived);
    res.json(rows.map(serializeProject));
  });

  app.post("/api/projects", requireAuth, requireWritable, async (req, res) => {
    const body = req.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2) return res.status(400).json({ error: "Project name is required" });

    const project = await storage.createProject({
      workspaceId: res.locals.workspaceId as string,
      name,
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      websiteUrl: typeof body.websiteUrl === "string" ? body.websiteUrl.trim() || null : null,
      projectType: projectTypes.includes(body.projectType) ? body.projectType : "other",
      industry: typeof body.industry === "string" ? body.industry.trim() || null : null,
      targetAudience: typeof body.targetAudience === "string" ? body.targetAudience.trim() || null : null,
      objectives: Array.isArray(body.objectives) ? JSON.stringify(body.objectives.filter((value: unknown) => typeof value === "string")) : null,
      priorities: Array.isArray(body.priorities)
        ? JSON.stringify(body.priorities.filter((value: unknown) => auditCategories.includes(value as AuditCategory)))
        : null,
      referenceTokens: body.referenceTokens ? JSON.stringify(body.referenceTokens) : null,
    });

    const initialPages = Array.isArray(body.pages) ? body.pages : [];
    for (const [index, page] of initialPages.entries()) {
      if (typeof page?.url !== "string" || !page.url.trim()) continue;
      await storage.createPage({
        projectId: project.id,
        name: typeof page.name === "string" && page.name.trim() ? page.name.trim() : `Page ${index + 1}`,
        url: page.url.trim(),
        notes: typeof page.notes === "string" ? page.notes.trim() || null : null,
        sortOrder: index,
      });
    }

    if (project.websiteUrl && initialPages.length === 0) {
      await storage.createPage({
        projectId: project.id,
        name: "Homepage",
        url: project.websiteUrl,
        sortOrder: 0,
      });
    }

    res.status(201).json(serializeProject(project as never));
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    const project = await storage.getProject(p(req, "id"));
    if (!project || project.workspaceId !== res.locals.workspaceId) {
      return res.status(404).json({ error: "Project not found" });
    }

    const [projectPages, projectAudits, projectFindings] = await Promise.all([
      storage.listPages(project.id),
      storage.listAudits({ projectId: project.id }),
      storage.listFindings({ projectId: project.id }),
    ]);

    const completed = projectAudits.filter((audit) => audit.status === "completed" && audit.overallScore !== null);

    res.json({
      project: serializeProject(project as never),
      objectives: parseJson<string[]>(project.objectives, []),
      priorities: parseJson<AuditCategory[]>(project.priorities, []),
      referenceTokens: parseJson<ReferenceTokens | null>(project.referenceTokens, null),
      pages: projectPages.map((page) => ({
        ...page,
        audits: projectAudits.filter((audit) => audit.pageId === page.id).length,
        latestScore:
          projectAudits.find((audit) => audit.pageId === page.id && audit.status === "completed")?.overallScore ?? null,
      })),
      audits: projectAudits.map(serializeAudit),
      findings: {
        total: projectFindings.length,
        open: projectFindings.filter((finding) => finding.status === "open").length,
        resolved: projectFindings.filter((finding) => finding.status === "resolved").length,
        bySeverity: projectFindings.reduce<Record<string, number>>((acc, finding) => {
          acc[finding.severity] = (acc[finding.severity] ?? 0) + 1;
          return acc;
        }, {}),
      },
      stats: {
        auditCount: projectAudits.length,
        completedAudits: completed.length,
        averageScore: completed.length
          ? Math.round(completed.reduce((sum, audit) => sum + (audit.overallScore ?? 0), 0) / completed.length)
          : null,
        bestScore: completed.length ? Math.max(...completed.map((audit) => audit.overallScore ?? 0)) : null,
      },
      history: completed
        .slice()
        .sort((a, b) => new Date(a.completedAt ?? 0).getTime() - new Date(b.completedAt ?? 0).getTime())
        .map((audit) => ({
          id: audit.id,
          name: audit.name,
          score: audit.overallScore,
          date: audit.completedAt,
        })),
    });
  });

  app.patch("/api/projects/:id", requireAuth, requireWritable, async (req, res) => {
    const project = await storage.getProject(p(req, "id"));
    if (!project || project.workspaceId !== res.locals.workspaceId) {
      return res.status(404).json({ error: "Project not found" });
    }

    const body = req.body ?? {};
    const updated = await storage.updateProject(project.id, {
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : project.name,
      description: typeof body.description === "string" ? body.description.trim() || null : project.description,
      websiteUrl: typeof body.websiteUrl === "string" ? body.websiteUrl.trim() || null : project.websiteUrl,
      projectType: projectTypes.includes(body.projectType) ? body.projectType : project.projectType,
      industry: typeof body.industry === "string" ? body.industry.trim() || null : project.industry,
      targetAudience: typeof body.targetAudience === "string" ? body.targetAudience.trim() || null : project.targetAudience,
      objectives: Array.isArray(body.objectives) ? JSON.stringify(body.objectives) : project.objectives,
      priorities: Array.isArray(body.priorities) ? JSON.stringify(body.priorities) : project.priorities,
      referenceTokens: body.referenceTokens === undefined ? project.referenceTokens : body.referenceTokens ? JSON.stringify(body.referenceTokens) : null,
      archived: typeof body.archived === "boolean" ? body.archived : project.archived,
    });

    res.json(serializeProject(updated as never));
  });

  app.delete("/api/projects/:id", requireAuth, requireWritable, async (req, res) => {
    const project = await storage.getProject(p(req, "id"));
    if (!project || project.workspaceId !== res.locals.workspaceId) {
      return res.status(404).json({ error: "Project not found" });
    }
    await storage.deleteProject(project.id);
    res.status(204).send();
  });

  /* -------------------------------- pages ------------------------------- */

  app.post("/api/projects/:id/pages", requireAuth, requireWritable, async (req, res) => {
    const project = await storage.getProject(p(req, "id"));
    if (!project || project.workspaceId !== res.locals.workspaceId) {
      return res.status(404).json({ error: "Project not found" });
    }
    const { name, url, notes } = req.body ?? {};
    if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "Page name is required" });
    if (typeof url !== "string" || !url.trim()) return res.status(400).json({ error: "Page URL is required" });

    try {
      assertPublicTarget(url);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid URL" });
    }

    const existing = await storage.listPages(project.id);
    const page = await storage.createPage({
      projectId: project.id,
      name: name.trim(),
      url: url.trim(),
      notes: typeof notes === "string" ? notes.trim() || null : null,
      sortOrder: existing.length,
    });
    res.status(201).json(page);
  });

  app.delete("/api/projects/:id/pages/:pageId", requireAuth, requireWritable, async (req, res) => {
    const project = await storage.getProject(p(req, "id"));
    if (!project || project.workspaceId !== res.locals.workspaceId) {
      return res.status(404).json({ error: "Project not found" });
    }
    await storage.deletePage(p(req, "pageId"));
    res.status(204).send();
  });

  /* -------------------------------- audits ------------------------------ */

  app.get("/api/audits", requireAuth, async (req, res) => {
    const projects = await storage.listProjects(res.locals.workspaceId as string, true);
    const projectIds = projects.map((project) => project.id);
    if (projectIds.length === 0) return res.json([]);

    const rows = await storage.listAudits({
      projectId: typeof req.query.projectId === "string" ? req.query.projectId : undefined,
      projectIds,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });

    const projectMap = new Map(projects.map((project) => [project.id, project]));
    res.json(
      rows.map((audit) => ({
        ...serializeAudit(audit),
        projectName: projectMap.get(audit.projectId)?.name ?? "Unknown project",
      })),
    );
  });

  app.post("/api/audits", requireAuth, requireWritable, async (req, res) => {
    const parsed = createAuditRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid audit configuration", details: parsed.error.errors });
    }
    const payload = parsed.data;

    const project = await storage.getProject(payload.projectId);
    if (!project || project.workspaceId !== res.locals.workspaceId) {
      return res.status(404).json({ error: "Project not found" });
    }

    let targetUrl: string;
    try {
      targetUrl = assertPublicTarget(payload.targetUrl);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid URL" });
    }

    const page = payload.pageId ? await storage.getPage(payload.pageId) : await storage.findPageByUrl(project.id, targetUrl);

    const audit = await storage.createAudit({
      projectId: project.id,
      pageId: page?.id ?? null,
      name: payload.name,
      description: payload.description ?? null,
      targetUrl,
      status: "queued",
      scope: JSON.stringify(payload.scope),
      context: JSON.stringify({
        targetAudience: payload.targetAudience ?? project.targetAudience ?? null,
        objectives: payload.objectives ?? parseJson<string[]>(project.objectives, []),
        priorities: payload.priorities ?? parseJson<AuditCategory[]>(project.priorities, []),
        viewport: payload.viewport,
      }),
      isSample: false,
    });

    if (!page) {
      await storage.createPage({
        projectId: project.id,
        name: new URL(targetUrl).pathname === "/" ? "Homepage" : new URL(targetUrl).pathname,
        url: targetUrl,
      });
    }

    void executeAuditJob(audit.id, payload.scope, payload.viewport as ViewportPreset, parseJson<ReferenceTokens | null>(project.referenceTokens, null));

    res.status(202).json({ audit: serializeAudit(audit), statusUrl: `/api/audits/${audit.id}/status` });
  });

  app.get("/api/audits/:id", requireAuth, async (req, res) => {
    const audit = await storage.getAudit(p(req, "id"));
    if (!audit) return res.status(404).json({ error: "Audit not found" });

    const project = await storage.getProject(audit.projectId);
    if (!project || project.workspaceId !== res.locals.workspaceId) {
      return res.status(404).json({ error: "Audit not found" });
    }

    const auditFindings = await storage.listFindings({ auditId: audit.id });
    const categoryScores = parseJson<Record<string, { category: string; score: number | null; automatedChecks: number; manualChecks: number; checks: unknown[]; findings: number }>>(
      audit.categoryScores,
      {},
    );

    res.json({
      audit: serializeAudit(audit),
      project: serializeProject(project as never),
      scope: parseJson<AuditCategory[]>(audit.scope, []),
      context: parseJson<Record<string, unknown>>(audit.context, {}),
      stages: parseJson<AuditStage[]>(audit.stages, []),
      categoryScores,
      metrics: parseJson<Record<string, unknown>>(audit.metrics, {}),
      comparison: parseJson<Record<string, unknown> | null>(audit.comparison, null),
      findings: auditFindings,
      grade: gradeLabel(audit.overallScore),
    });
  });

  app.get("/api/audits/:id/status", requireAuth, async (req, res) => {
    const audit = await storage.getAudit(p(req, "id"));
    if (!audit) return res.status(404).json({ error: "Audit not found" });

    res.json({
      id: audit.id,
      status: audit.status,
      stages: parseJson<AuditStage[]>(audit.stages, []),
      overallScore: audit.overallScore,
      error: audit.error,
      durationMs: audit.durationMs,
    });
  });

  app.patch("/api/audits/:id", requireAuth, requireWritable, async (req, res) => {
    const audit = await storage.getAudit(p(req, "id"));
    if (!audit) return res.status(404).json({ error: "Audit not found" });
    const body = req.body ?? {};
    const updated = await storage.updateAudit(audit.id, {
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : audit.name,
      description: typeof body.description === "string" ? body.description.trim() || null : audit.description,
      status: body.status === "archived" ? "archived" : audit.status,
    });
    res.json(serializeAudit(updated as never));
  });

  app.post("/api/audits/:id/rerun", requireAuth, requireWritable, async (req, res) => {
    const audit = await storage.getAudit(p(req, "id"));
    if (!audit) return res.status(404).json({ error: "Audit not found" });
    if (running.has(audit.id)) return res.status(409).json({ error: "This audit is already running" });

    const project = await storage.getProject(audit.projectId);
    await storage.deleteFindingsByAuditId(audit.id);
    await storage.updateAudit(audit.id, {
      status: "queued",
      error: null,
      stages: JSON.stringify([]),
      completedAt: null,
      screenshotUrl: null,
    });

    void executeAuditJob(
      audit.id,
      parseJson<AuditCategory[]>(audit.scope, []),
      (parseJson<{ viewport?: ViewportPreset }>(audit.context, {}).viewport ?? "all") as ViewportPreset,
      parseJson<ReferenceTokens | null>(project?.referenceTokens ?? null, null),
    );

    res.status(202).json({ audit: serializeAudit(audit), statusUrl: `/api/audits/${audit.id}/status` });
  });

  app.delete("/api/audits/:id", requireAuth, requireWritable, async (req, res) => {
    const audit = await storage.getAudit(p(req, "id"));
    if (!audit) return res.status(404).json({ error: "Audit not found" });
    await storage.deleteAudit(audit.id);
    res.status(204).send();
  });

  /* ------------------------------- findings ----------------------------- */

  app.get("/api/findings", requireAuth, async (req, res) => {
    const projects = await storage.listProjects(res.locals.workspaceId as string, true);
    const projectIds = projects.map((project) => project.id);
    if (projectIds.length === 0) return res.json([]);

    const rows = await storage.listFindings({
      projectIds,
      projectId: typeof req.query.projectId === "string" ? req.query.projectId : undefined,
      auditId: typeof req.query.auditId === "string" ? req.query.auditId : undefined,
      category: typeof req.query.category === "string" ? req.query.category : undefined,
      severity: typeof req.query.severity === "string" ? req.query.severity : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });

    const projectMap = new Map(projects.map((project) => [project.id, project.name]));
    res.json(rows.map((finding) => ({ ...finding, projectName: projectMap.get(finding.projectId) ?? "—" })));
  });

  app.patch("/api/findings/:id", requireAuth, requireWritable, async (req, res) => {
    const parsed = findingPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid finding update" });

    const finding = await storage.getFinding(p(req, "id"));
    if (!finding) return res.status(404).json({ error: "Finding not found" });

    const updated = await storage.updateFinding(finding.id, parsed.data);
    res.json(updated);
  });

  /* -------------------------------- reports ----------------------------- */

  app.get("/api/audits/:id/report.json", requireAuth, async (req, res) => {
    const loaded = await loadReportContext(req, res);
    if (!loaded) return;
    const model = buildReportModel(loaded);
    res.setHeader("content-disposition", `attachment; filename="designlens-${loaded.audit.id}.json"`);
    res.json(model);
  });

  app.get("/api/audits/:id/report", requireAuth, async (req, res) => {
    const loaded = await loadReportContext(req, res);
    if (!loaded) return;
    const html = await renderReportHtml(buildReportModel(loaded), { publicDir });
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(html);
  });

  app.get("/api/audits/:id/report.pdf", requireAuth, async (req, res) => {
    const loaded = await loadReportContext(req, res);
    if (!loaded) return;

    const html = await renderReportHtml(buildReportModel(loaded), { publicDir, forPdf: true });
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" },
      });
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-disposition", `attachment; filename="designlens-${loaded.audit.id}.pdf"`);
      res.send(pdf);
    } catch (error) {
      console.error("PDF generation failed:", error);
      res.status(500).json({ error: "PDF generation failed" });
    } finally {
      await browser.close().catch(() => undefined);
    }
  });

  /* --------------------------- internal helpers ------------------------- */

  async function executeAuditJob(
    auditId: string,
    scope: AuditCategory[],
    viewport: ViewportPreset,
    referenceTokens: ReferenceTokens | null,
  ) {
    if (running.has(auditId)) return;
    running.add(auditId);
    try {
      const audit = await storage.getAudit(auditId);
      if (!audit) return;

      await storage.updateAudit(auditId, {
        status: "running",
        startedAt: new Date(),
        error: null,
      });

      await runAudit({
        audit,
        scope,
        viewport,
        referenceTokens,
        screenshotDir,
        onProgress: async (stages) => {
          await storage.updateAudit(auditId, { stages: JSON.stringify(stages) });
        },
      });
    } catch (error) {
      console.error(`Audit ${auditId} failed:`, error instanceof Error ? error.message : error);
    } finally {
      running.delete(auditId);
    }
  }

  async function loadReportContext(req: Request, res: Response) {
    const audit = await storage.getAudit(p(req, "id"));
    if (!audit) {
      res.status(404).json({ error: "Audit not found" });
      return null;
    }
    const project = await storage.getProject(audit.projectId);
    if (!project || project.workspaceId !== res.locals.workspaceId) {
      res.status(404).json({ error: "Audit not found" });
      return null;
    }
    if (!audit.categoryScores) {
      res.status(409).json({ error: "This audit has no results yet" });
      return null;
    }
    const auditFindings = await storage.listFindings({ auditId: audit.id });
    return { project: project as Project, audit, findings: auditFindings };
  }

  return _httpServer;
}

function p(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function serializeAudit(audit: {
  id: string;
  projectId: string;
  pageId: string | null;
  name: string;
  description: string | null;
  targetUrl: string;
  status: string;
  scope: string;
  overallScore: number | null;
  error: string | null;
  screenshotUrl: string | null;
  durationMs: number | null;
  isSample: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date | null;
}) {
  return {
    id: audit.id,
    projectId: audit.projectId,
    pageId: audit.pageId,
    name: audit.name,
    description: audit.description,
    targetUrl: audit.targetUrl,
    status: audit.status,
    scope: parseJson<string[]>(audit.scope, []),
    overallScore: audit.overallScore,
    grade: gradeLabel(audit.overallScore),
    error: audit.error,
    screenshotUrl: audit.screenshotUrl,
    durationMs: audit.durationMs,
    isSample: audit.isSample,
    startedAt: audit.startedAt,
    completedAt: audit.completedAt,
    createdAt: audit.createdAt,
  };
}

function serializeProject(project: {
  id: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  projectType: string;
  industry: string | null;
  targetAudience: string | null;
  archived: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  pageCount?: number;
  auditCount?: number;
  openFindings?: number;
  latestScore?: number | null;
  lastAuditedAt?: Date | null;
}) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    websiteUrl: project.websiteUrl,
    projectType: project.projectType,
    projectTypeLabel: PROJECT_TYPE_LABELS[project.projectType as keyof typeof PROJECT_TYPE_LABELS] ?? project.projectType,
    industry: project.industry,
    targetAudience: project.targetAudience,
    archived: project.archived,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    pageCount: project.pageCount ?? 0,
    auditCount: project.auditCount ?? 0,
    openFindings: project.openFindings ?? 0,
    latestScore: project.latestScore ?? null,
    lastAuditedAt: project.lastAuditedAt ?? null,
  };
}
