import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { parseJson } from "./lib/json";
import {
  audits,
  findings,
  pages,
  projects,
  users,
  workspaces,
  type Audit,
  type Finding,
  type Page,
  type Project,
  type Workspace,
} from "@shared/schema";

/* ------------------------------------------------------------------ *
 * Data access layer. Every read that returns a JSON column goes through
 * the parsers below so callers never have to re-implement decoding.
 * ------------------------------------------------------------------ */

export { parseJson } from "./lib/json";

export interface ProjectWithStats extends Project {
  pageCount: number;
  auditCount: number;
  openFindings: number;
  latestScore: number | null;
  lastAuditedAt: Date | null;
}

export const storage = {
  /* ---------------------------- workspaces --------------------------- */

  async getOrCreateWorkspace(): Promise<Workspace> {
    const existing = await db.select().from(workspaces).where(eq(workspaces.isDemo, false)).limit(1);
    if (existing[0]) return existing[0];
    const created = await db
      .insert(workspaces)
      .values({
        name: "My workspace",
        description: "Default DesignLens workspace",
        isDemo: false,
      })
      .returning();
    return created[0];
  },

  async getDemoWorkspace(): Promise<Workspace | null> {
    const rows = await db.select().from(workspaces).where(eq(workspaces.isDemo, true)).limit(1);
    return rows[0] ?? null;
  },

  /* ----------------------------- projects ---------------------------- */

  async listProjects(workspaceId: string, includeArchived = false): Promise<ProjectWithStats[]> {
    const rows = await db
      .select()
      .from(projects)
      .where(
        includeArchived
          ? eq(projects.workspaceId, workspaceId)
          : and(eq(projects.workspaceId, workspaceId), eq(projects.archived, false)),
      )
      .orderBy(desc(projects.updatedAt));

    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const projectPages = await db.select().from(pages).where(inArray(pages.projectId, ids));
    const projectAudits = await db
      .select()
      .from(audits)
      .where(inArray(audits.projectId, ids))
      .orderBy(desc(audits.createdAt));
    const projectFindings = await db
      .select({ projectId: findings.projectId, status: findings.status })
      .from(findings)
      .where(inArray(findings.projectId, ids));

    return rows.map((project) => {
      const projectAuditList = projectAudits.filter((audit) => audit.projectId === project.id);
      const completed = projectAuditList.filter((audit) => audit.status === "completed");
      return {
        ...project,
        pageCount: projectPages.filter((page) => page.projectId === project.id).length,
        auditCount: projectAuditList.length,
        openFindings: projectFindings.filter(
          (finding) => finding.projectId === project.id && (finding.status === "open" || finding.status === "in-review"),
        ).length,
        latestScore: completed[0]?.overallScore ?? null,
        lastAuditedAt: completed[0]?.completedAt ?? null,
      };
    });
  },

  async getProject(id: string): Promise<Project | undefined> {
    const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return rows[0];
  },

  async createProject(values: typeof projects.$inferInsert): Promise<Project> {
    const rows = await db.insert(projects).values(values).returning();
    return rows[0];
  },

  async updateProject(id: string, values: Partial<typeof projects.$inferInsert>): Promise<Project | undefined> {
    const rows = await db
      .update(projects)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return rows[0];
  },

  async deleteProject(id: string): Promise<void> {
    await db.delete(findings).where(eq(findings.projectId, id));
    await db.delete(audits).where(eq(audits.projectId, id));
    await db.delete(pages).where(eq(pages.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
  },

  /* ------------------------------ pages ------------------------------ */

  async listPages(projectId: string): Promise<Page[]> {
    return db.select().from(pages).where(eq(pages.projectId, projectId)).orderBy(pages.sortOrder);
  },

  async getPage(id: string): Promise<Page | undefined> {
    const rows = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
    return rows[0];
  },

  async findPageByUrl(projectId: string, url: string): Promise<Page | undefined> {
    const rows = await db
      .select()
      .from(pages)
      .where(and(eq(pages.projectId, projectId), eq(pages.url, url)))
      .limit(1);
    return rows[0];
  },

  async createPage(values: typeof pages.$inferInsert): Promise<Page> {
    const rows = await db.insert(pages).values(values).returning();
    return rows[0];
  },

  async deletePage(id: string): Promise<void> {
    await db.delete(pages).where(eq(pages.id, id));
  },

  /* ------------------------------ audits ----------------------------- */

  async listAudits(options: {
    projectId?: string;
    projectIds?: string[];
    status?: string;
    limit?: number;
  } = {}): Promise<Audit[]> {
    const conditions = [];
    if (options.projectId) conditions.push(eq(audits.projectId, options.projectId));
    if (options.projectIds?.length) conditions.push(inArray(audits.projectId, options.projectIds));
    if (options.status) conditions.push(eq(audits.status, options.status));

    const query = db
      .select()
      .from(audits)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(audits.createdAt));

    return options.limit ? query.limit(options.limit) : query;
  },

  async getAudit(id: string): Promise<Audit | undefined> {
    const rows = await db.select().from(audits).where(eq(audits.id, id)).limit(1);
    return rows[0];
  },

  async createAudit(values: typeof audits.$inferInsert): Promise<Audit> {
    const rows = await db.insert(audits).values(values).returning();
    return rows[0];
  },

  async updateAudit(id: string, values: Partial<typeof audits.$inferInsert>): Promise<Audit | undefined> {
    const rows = await db.update(audits).set(values).where(eq(audits.id, id)).returning();
    return rows[0];
  },

  async deleteAudit(id: string): Promise<void> {
    await db.delete(findings).where(eq(findings.auditId, id));
    await db.delete(audits).where(eq(audits.id, id));
  },

  async previousCompletedAudit(audit: Audit): Promise<Audit | null> {
    const conditions = audit.pageId
      ? and(eq(audits.pageId, audit.pageId), eq(audits.status, "completed"))
      : and(eq(audits.projectId, audit.projectId), eq(audits.status, "completed"));

    const rows = await db
      .select()
      .from(audits)
      .where(conditions)
      .orderBy(desc(audits.completedAt))
      .limit(6);

    const previous = rows.find((row) => row.id !== audit.id);
    return previous ?? null;
  },

  async latestAuditForPage(projectId: string, pageId: string): Promise<Audit | null> {
    const rows = await db
      .select()
      .from(audits)
      .where(and(eq(audits.projectId, projectId), eq(audits.pageId, pageId), eq(audits.status, "completed")))
      .orderBy(desc(audits.completedAt))
      .limit(1);
    return rows[0] ?? null;
  },

  /* ----------------------------- findings ---------------------------- */

  async listFindings(options: {
    auditId?: string;
    projectId?: string;
    projectIds?: string[];
    category?: string;
    severity?: string;
    status?: string;
    limit?: number;
  } = {}): Promise<Finding[]> {
    const conditions = [];
    if (options.auditId) conditions.push(eq(findings.auditId, options.auditId));
    if (options.projectId) conditions.push(eq(findings.projectId, options.projectId));
    if (options.projectIds?.length) conditions.push(inArray(findings.projectId, options.projectIds));
    if (options.category) conditions.push(eq(findings.category, options.category));
    if (options.severity) conditions.push(eq(findings.severity, options.severity));
    if (options.status) conditions.push(eq(findings.status, options.status));

    const query = db
      .select()
      .from(findings)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(findings.createdAt));

    return options.limit ? query.limit(options.limit) : query;
  },

  async getFinding(id: string): Promise<Finding | undefined> {
    const rows = await db.select().from(findings).where(eq(findings.id, id)).limit(1);
    return rows[0];
  },

  async createFindings(values: Array<typeof findings.$inferInsert>): Promise<Finding[]> {
    if (values.length === 0) return [];
    return db.insert(findings).values(values).returning();
  },

  async updateFinding(id: string, values: Partial<typeof findings.$inferInsert>): Promise<Finding | undefined> {
    const rows = await db
      .update(findings)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(findings.id, id))
      .returning();
    return rows[0];
  },

  async deleteFindingsByAuditId(auditId: string): Promise<void> {
    await db.delete(findings).where(eq(findings.auditId, auditId));
  },

  /* ------------------------------- users ----------------------------- */

  async findUserByEmail(email: string) {
    const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    return rows[0];
  },

  async findUserById(id: string) {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0];
  },

  async createUser(values: typeof users.$inferInsert) {
    const rows = await db.insert(users).values(values).returning();
    return rows[0];
  },

  async countUsers(): Promise<number> {
    const rows = await db.select({ count: sql<number>`count(*)` }).from(users);
    return Number(rows[0]?.count ?? 0);
  },

  /* ----------------------------- analytics --------------------------- */

  async dashboardMetrics(workspaceId: string) {
    const projectRows = await db.select().from(projects).where(eq(projects.workspaceId, workspaceId));
    const projectIds = projectRows.map((project) => project.id);
    if (projectIds.length === 0) {
      return {
        totals: {
          projects: 0,
          audits: 0,
          completedAudits: 0,
          averageScore: null as number | null,
          criticalFindings: 0,
          openFindings: 0,
          resolvedFindings: 0,
          scoreDelta: null as number | null,
        },
        categoryAverages: [] as Array<{ category: string; score: number; audits: number }>,
        trend: [] as Array<{ date: string; score: number; auditName: string }>,
        severityDistribution: {} as Record<string, number>,
        recentAudits: [] as Audit[],
        projects: [] as ProjectWithStats[],
      };
    }

    const auditRows = await db.select().from(audits).where(inArray(audits.projectId, projectIds));
    const findingRows = await db.select().from(findings).where(inArray(findings.projectId, projectIds));

    const completed = auditRows
      .filter((audit) => audit.status === "completed" && audit.overallScore !== null)
      .sort((a, b) => new Date(b.completedAt ?? b.createdAt ?? 0).getTime() - new Date(a.completedAt ?? a.createdAt ?? 0).getTime());

    const averageScore = completed.length
      ? Math.round(completed.reduce((sum, audit) => sum + (audit.overallScore ?? 0), 0) / completed.length)
      : null;

    const previousAverage = completed.length > 3
      ? Math.round(
          completed.slice(3).reduce((sum, audit) => sum + (audit.overallScore ?? 0), 0) /
            Math.max(1, completed.length - 3),
        )
      : null;

    const categoryTotals = new Map<string, { sum: number; count: number }>();
    for (const audit of completed) {
      const scores = parseJson<Record<string, { score: number | null }>>(audit.categoryScores, {});
      for (const [category, value] of Object.entries(scores)) {
        if (value && typeof value.score === "number") {
          const entry = categoryTotals.get(category) ?? { sum: 0, count: 0 };
          entry.sum += value.score;
          entry.count += 1;
          categoryTotals.set(category, entry);
        }
      }
    }

    const severityDistribution: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    };
    for (const finding of findingRows) {
      if (finding.severity in severityDistribution) severityDistribution[finding.severity] += 1;
    }

    return {
      totals: {
        projects: projectRows.length,
        audits: auditRows.length,
        completedAudits: completed.length,
        averageScore,
        criticalFindings: findingRows.filter((finding) => finding.severity === "critical" && finding.status !== "resolved").length,
        openFindings: findingRows.filter((finding) => finding.status === "open" || finding.status === "in-review").length,
        resolvedFindings: findingRows.filter((finding) => finding.status === "resolved").length,
        scoreDelta: averageScore !== null && previousAverage !== null ? averageScore - previousAverage : null,
      },
      categoryAverages: [...categoryTotals.entries()].map(([category, entry]) => ({
        category,
        score: Math.round(entry.sum / entry.count),
        audits: entry.count,
      })),
      trend: completed
        .slice(0, 12)
        .reverse()
        .map((audit) => ({
          date: (audit.completedAt ?? audit.createdAt ?? new Date()).toString(),
          score: audit.overallScore ?? 0,
          auditName: audit.name,
        })),
      severityDistribution,
      recentAudits: await db
        .select()
        .from(audits)
        .where(inArray(audits.projectId, projectIds))
        .orderBy(desc(audits.createdAt))
        .limit(6),
      projects: await this.listProjects(workspaceId),
    };
  },

  async projectScoreHistory(projectId: string) {
    const rows = await db
      .select()
      .from(audits)
      .where(and(eq(audits.projectId, projectId), eq(audits.status, "completed")))
      .orderBy(audits.completedAt);
    return rows.filter((row) => row.overallScore !== null);
  },
};

export type Storage = typeof storage;
