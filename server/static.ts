import express, { type Express } from "express";
import { join } from "node:path";

/** Serves the production build and falls back to index.html for client routes. */
export function serveStatic(app: Express): void {
  const dist = join(process.cwd(), "dist", "public");
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/api|\/screenshots).*/, (_req, res) => {
    res.sendFile(join(dist, "index.html"));
  });
}
