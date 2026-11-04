import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ------------------------------------------------------------------ *
 * DesignLens domain model
 *
 * Workspace → Project → Page → Audit → Findings → Recommendations
 * ------------------------------------------------------------------ */

export const auditCategories = [
  "usability",
  "accessibility",
  "visual-design",
  "responsive",
  "content",
  "performance",
  "consistency",
] as const;
export type AuditCategory = (typeof auditCategories)[number];

export const severityLevels = ["critical", "high", "medium", "low", "informational"] as const;
export type SeverityLevel = (typeof severityLevels)[number];

export const findingStatuses = ["open", "in-review", "resolved", "wont-fix"] as const;
export type FindingStatus = (typeof findingStatuses)[number];

export const auditStatuses = ["queued", "running", "completed", "failed", "archived"] as const;
export type AuditStatus = (typeof auditStatuses)[number];

export const detectionMethods = ["automated", "manual"] as const;
export type DetectionMethod = (typeof detectionMethods)[number];

export const projectTypes = [
  "e-commerce",
  "banking",
  "healthcare",
  "saas",
  "travel",
  "education",
  "portfolio",
  "mobile-app",
  "marketing-site",
  "internal-tool",
  "other",
] as const;
export type ProjectType = (typeof projectTypes)[number];

export const viewportPresets = ["desktop", "tablet", "mobile", "all"] as const;
export type ViewportPreset = (typeof viewportPresets)[number];

/* ----------------------------- tables ----------------------------- */

export const users = sqliteTable("users", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(datetime('now'))`),
});

export const sessions = sqliteTable(
  "sessions",
  {
    sid: text("sid").primaryKey(),
    sess: text("sess").notNull(),
    expire: integer("expire", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("idx_session_expire").on(table.expire)],
);

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  name: text("name").notNull(),
  description: text("description"),
  /** Demo workspaces are read-only and never share data with user workspaces. */
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(datetime('now'))`),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    websiteUrl: text("website_url"),
    projectType: text("project_type").notNull().default("other"),
    industry: text("industry"),
    targetAudience: text("target_audience"),
    objectives: text("objectives"), // JSON string[]
    priorities: text("priorities"), // JSON AuditCategory[]
    referenceTokens: text("reference_tokens"), // JSON design-system reference
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(datetime('now'))`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_projects_workspace").on(table.workspaceId)],
);

export const pages = sqliteTable(
  "pages",
  {
    id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_pages_project").on(table.projectId)],
);

export const audits = sqliteTable(
  "audits",
  {
    id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
    projectId: text("project_id").notNull(),
    pageId: text("page_id"),
    name: text("name").notNull(),
    description: text("description"),
    targetUrl: text("target_url").notNull(),
    status: text("status").notNull().default("queued"),
    /** JSON string[] of AuditCategory */
    scope: text("scope").notNull().default("[]"),
    /** JSON: { targetAudience, objectives, priorities, viewport } */
    context: text("context"),
    /** JSON: per-category scores with the checks that produced them */
    categoryScores: text("category_scores"),
    /** JSON: raw measured signals */
    metrics: text("metrics"),
    /** JSON: ordered execution stage log */
    stages: text("stages"),
    /** JSON: comparison against the previous audit of the same page */
    comparison: text("comparison"),
    overallScore: integer("overall_score"),
    error: text("error"),
    screenshotUrl: text("screenshot_url"),
    durationMs: integer("duration_ms"),
    isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_audits_project").on(table.projectId),
    index("idx_audits_page").on(table.pageId),
  ],
);

export const findings = sqliteTable(
  "findings",
  {
    id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
    auditId: text("audit_id").notNull(),
    projectId: text("project_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("open"),
    detection: text("detection").notNull().default("automated"),
    evidence: text("evidence"),
    whyItMatters: text("why_it_matters"),
    recommendation: text("recommendation"),
    implementation: text("implementation"),
    pageUrl: text("page_url"),
    selector: text("selector"),
    wcagCriterion: text("wcag_criterion"),
    affectedCount: integer("affected_count"),
    screenshotUrl: text("screenshot_url"),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(datetime('now'))`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_findings_audit").on(table.auditId),
    index("idx_findings_project").on(table.projectId),
  ],
);

/* --------------------------- insert schemas ------------------------ */

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPageSchema = createInsertSchema(pages).omit({
  id: true,
  createdAt: true,
});

export const insertAuditSchema = createInsertSchema(audits).omit({
  id: true,
  createdAt: true,
});

export const insertFindingSchema = createInsertSchema(findings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const createAuditRequestSchema = z.object({
  projectId: z.string().min(1),
  pageId: z.string().optional().nullable(),
  name: z.string().min(2).max(160),
  description: z.string().max(2000).optional().nullable(),
  targetUrl: z.string().min(3).max(2048),
  scope: z.array(z.enum(auditCategories)).min(1),
  targetAudience: z.string().max(400).optional().nullable(),
  objectives: z.array(z.string().max(300)).max(12).optional(),
  priorities: z.array(z.enum(auditCategories)).max(7).optional(),
  viewport: z.enum(viewportPresets).default("all"),
});

export const findingPatchSchema = z.object({
  status: z.enum(findingStatuses).optional(),
  severity: z.enum(severityLevels).optional(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Page = typeof pages.$inferSelect;
export type InsertPage = z.infer<typeof insertPageSchema>;
export type Audit = typeof audits.$inferSelect;
export type InsertAudit = z.infer<typeof insertAuditSchema>;
export type Finding = typeof findings.$inferSelect;
export type InsertFinding = z.infer<typeof insertFindingSchema>;
export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type CreateAuditRequest = z.infer<typeof createAuditRequestSchema>;
