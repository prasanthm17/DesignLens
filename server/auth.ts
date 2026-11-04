import session from "express-session";
import type { Express, RequestHandler } from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Store } from "express-session";
import { sqlite } from "./db";
import { storage } from "./storage";
import { ensureDemoWorkspace } from "./seed";

/* ------------------------------------------------------------------ *
 * Standalone authentication.
 *
 * There is no SSO, no tenant directory and no employer dependency: an
 * account is an email + password held in this application's own database.
 * Demo mode is a separate, read-only session bound to a seeded workspace.
 * ------------------------------------------------------------------ */

const SESSION_TTL = 1000 * 60 * 60 * 24 * 7;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Minimal SQLite-backed session store so logins survive a server restart. */
class SqliteSessionStore extends Store {
  constructor() {
    super();
    setInterval(() => this.prune(), 1000 * 60 * 30).unref?.();
  }

  get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void): void {
    try {
      const row = sqlite.prepare("SELECT sess, expire FROM sessions WHERE sid = ?").get(sid) as
        | { sess: string; expire: number }
        | undefined;
      if (!row) return callback(null, null);
      if (Number(row.expire) < Date.now()) {
        this.destroy(sid, () => undefined);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess) as session.SessionData);
    } catch (error) {
      callback(error);
    }
  }

  set(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    try {
      const expire = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + SESSION_TTL;
      sqlite
        .prepare(
          "INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire",
        )
        .run(sid, JSON.stringify(sess), expire);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid: string, sess: session.SessionData, callback?: () => void): void {
    try {
      const expire = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + SESSION_TTL;
      sqlite.prepare("UPDATE sessions SET expire = ? WHERE sid = ?").run(expire, sid);
    } catch {
      /* ignore */
    }
    callback?.();
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    try {
      sqlite.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  prune(): void {
    try {
      sqlite.prepare("DELETE FROM sessions WHERE expire < ?").run(Date.now());
    } catch {
      /* ignore */
    }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const sessionData = req.session as unknown as { userId?: string; demo?: boolean };
  if (sessionData?.demo) {
    const demo = await storage.getDemoWorkspace();
    if (!demo) return res.status(503).json({ error: "Demo workspace is not available" });
    res.locals.mode = "demo";
    res.locals.workspaceId = demo.id;
    return next();
  }
  if (!sessionData?.userId) return res.status(401).json({ error: "Not authenticated" });

  const workspace = await storage.getOrCreateWorkspace();
  res.locals.mode = "user";
  res.locals.userId = sessionData.userId;
  res.locals.workspaceId = workspace.id;
  next();
};

/** Demo sessions are read-only: visitors cannot mutate the sample workspace. */
export const requireWritable: RequestHandler = (req, res, next) => {
  if (res.locals.mode === "demo") {
    return res.status(403).json({ error: "The demo workspace is read-only. Create an account to run audits." });
  }
  next();
};

export function setupAuth(app: Express): void {
  app.set("trust proxy", 1);
  app.use(
    session({
      secret: process.env.SESSION_SECRET || randomBytes(24).toString("hex"),
      store: new SqliteSessionStore(),
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: SESSION_TTL },
    }),
  );

  app.get("/api/auth/me", async (req, res) => {
    const sessionData = req.session as unknown as { userId?: string; demo?: boolean };

    if (sessionData?.demo) {
      const demo = await storage.getDemoWorkspace();
      return res.json({
        mode: "demo",
        user: null,
        workspace: demo ? { id: demo.id, name: demo.name } : null,
      });
    }

    if (!sessionData?.userId) return res.json({ mode: "anonymous", user: null, workspace: null });

    const workspace = await storage.getOrCreateWorkspace();
    const users = await storage.countUsers();
    const record = await storage.findUserById(sessionData.userId);
    return res.json({
      mode: "user",
      user: record ? { id: record.id, email: record.email, name: record.name } : null,
      workspace: { id: workspace.id, name: workspace.name },
      hasUsers: users > 0,
    });
  });

  app.post("/api/auth/register", async (req, res) => {
    const { email, password, name } = req.body ?? {};
    if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Use a password of at least 8 characters" });
    }

    const existing = await storage.findUserByEmail(email);
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const user = await storage.createUser({
      email: email.toLowerCase(),
      name: (typeof name === "string" && name.trim()) || email.split("@")[0],
      passwordHash: hashPassword(password),
      role: "owner",
    });

    const sessionData = req.session as unknown as { userId?: string; email?: string; demo?: boolean };
    sessionData.userId = user.id;
    sessionData.email = user.email;
    delete sessionData.demo;

    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name } });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await storage.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Email or password is incorrect" });
    }

    const sessionData = req.session as unknown as { userId?: string; email?: string; demo?: boolean };
    sessionData.userId = user.id;
    sessionData.email = user.email;
    delete sessionData.demo;

    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  });

  app.post("/api/auth/demo", async (_req, res) => {
    const demo = await ensureDemoWorkspace();
    const sessionData = _req.session as unknown as { userId?: string; demo?: boolean };
    sessionData.demo = true;
    delete sessionData.userId;
    res.json({ mode: "demo", workspace: { id: demo.id, name: demo.name } });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
}
