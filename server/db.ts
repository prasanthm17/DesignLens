import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import * as schema from "@shared/schema";

const dbPath = process.env.DATABASE_URL || "./data/designlens.db";

if (dbPath !== ":memory:") {
  // Ensure the parent directory exists before opening the database.
  const slash = Math.max(dbPath.lastIndexOf("/"), dbPath.lastIndexOf("\\"));
  if (slash > 0) {
    mkdirSync(dbPath.slice(0, slash), { recursive: true });
  }
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

/**
 * The schema is created idempotently on boot. SQLite has no migrations table in
 * this project, and every statement below is additive, so re-running is safe.
 */
export function ensureSchema(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at INTEGER DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expire INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_expire ON sessions(expire);

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      website_url TEXT,
      project_type TEXT NOT NULL DEFAULT 'other',
      industry TEXT,
      target_audience TEXT,
      objectives TEXT,
      priorities TEXT,
      reference_tokens TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (datetime('now')),
      updated_at INTEGER DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pages_project ON pages(project_id);

    CREATE TABLE IF NOT EXISTS audits (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      page_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      target_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      scope TEXT NOT NULL DEFAULT '[]',
      context TEXT,
      category_scores TEXT,
      metrics TEXT,
      stages TEXT,
      comparison TEXT,
      overall_score INTEGER,
      error TEXT,
      screenshot_url TEXT,
      duration_ms INTEGER,
      is_sample INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audits_project ON audits(project_id);
    CREATE INDEX IF NOT EXISTS idx_audits_page ON audits(page_id);

    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      audit_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      detection TEXT NOT NULL DEFAULT 'automated',
      evidence TEXT,
      why_it_matters TEXT,
      recommendation TEXT,
      implementation TEXT,
      page_url TEXT,
      selector TEXT,
      wcag_criterion TEXT,
      affected_count INTEGER,
      screenshot_url TEXT,
      created_at INTEGER DEFAULT (datetime('now')),
      updated_at INTEGER DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_findings_audit ON findings(audit_id);
    CREATE INDEX IF NOT EXISTS idx_findings_project ON findings(project_id);
  `);
}

ensureSchema();

export const db = drizzle(sqlite, { schema });
export { sqlite };
