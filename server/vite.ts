import type { Express } from "express";
import type { Server } from "node:http";

/** Vite in middleware mode so the dev server and the API share one port. */
export async function setupVite(app: Express, server: Server): Promise<void> {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.get(/^(?!\/api|\/screenshots).*/, async (req, res, next) => {
    try {
      const template = await vite.transformIndexHtml(
        req.originalUrl,
        await (await import("node:fs/promises")).readFile("client/index.html", "utf-8"),
      );
      res.status(200).set({ "content-type": "text/html" }).end(template);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}
