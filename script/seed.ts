/**
 * Creates the demo workspace if it does not exist yet.
 * Safe to run repeatedly: seeding is skipped when the workspace is present.
 */
import { ensureDemoWorkspace } from "../server/seed";
import { storage } from "../server/storage";

const workspace = await ensureDemoWorkspace();
const projects = await storage.listProjects(workspace.id, true);

console.log(`Demo workspace ready: ${workspace.name}`);
console.log(`  ${projects.length} projects · ${projects.reduce((sum, project) => sum + project.auditCount, 0)} audits`);

process.exit(0);
