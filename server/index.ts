import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { createServer } from "node:http";
import { registerRoutes } from "./routes";
import { setupAuth } from "./auth";
import { ensureScreenshotDir } from "./services/auditRunner";
import { browserAvailable } from "./services/capture";
import { ensureDemoWorkspace } from "./seed";
import { join } from "node:path";

export function log(message: string, source = "designlens"): void {
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
  console.log(`${time} [${source}] ${message}`);
}

const app: Express = express();
const httpServer = createServer(app);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/api/health", (_req, res) => {
  // Surfacing the browser state here means a misconfigured deploy shows up as a failing
  // health check instead of a crashed audit five minutes later.
  res.json({
    ok: true,
    service: "designlens",
    browser: browserAvailable(),
    time: new Date().toISOString(),
  });
});

app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api") && res.statusCode >= 400) {
      log(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - started}ms)`, "http");
    }
  });
  next();
});

async function boot() {
  const publicDir = join(process.cwd(), "public");
  await ensureScreenshotDir(join(publicDir, "screenshots"));

  setupAuth(app);
  await registerRoutes(httpServer, app);

  // Static screenshots captured by the audit engine.
  app.use("/screenshots", express.static(join(publicDir, "screenshots"), { maxAge: "1h", fallthrough: true }));

  if (process.env.NODE_ENV === "production") {
    const { serveStatic } = await import("./static");
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(app, httpServer);
  }

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    log(`Unhandled error: ${error.message}`, "error");
    if (res.headersSent) return;
    res.status(500).json({ error: "Something went wrong on the server" });
  });

  const port = Number(process.env.PORT || 8080);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`DesignLens running at http://localhost:${port}`, "server");
    if (!browserAvailable()) {
      log(
        "Chromium is not installed — audits will fail. Run `npx playwright install --with-deps chromium`, " +
          "or deploy the Dockerfile, which bakes the browser into the image.",
        "error",
      );
    }
  });

  // Warm the demo workspace so the first visitor does not wait on seeding.
  if (process.env.SKIP_DEMO_SEED !== "1") {
    ensureDemoWorkspace()
      .then(() => log("Demo workspace ready", "seed"))
      .catch((error) => log(`Demo seed skipped: ${error instanceof Error ? error.message : error}`, "seed"));
  }
}

boot().catch((error) => {
  console.error("Failed to start DesignLens:", error);
  process.exit(1);
});
