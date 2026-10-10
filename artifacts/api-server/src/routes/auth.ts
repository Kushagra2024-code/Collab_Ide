import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { signToken } from "../lib/auth";
import { normalizeEmail } from "../lib/email";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import {
  RegisterBody,
  LoginBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// In-memory fallback user store for resilience when DB is initializing or offline
interface FallbackUser {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: Date;
}
const fallbackUsers = new Map<string, FallbackUser>();
let fallbackIdCounter = 1000;

function getTestLoginAllowlist(): Set<string> {
  const raw = process.env.TEST_LOGIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => normalizeEmail(email))
      .filter(Boolean),
  );
}

function isTestLoginEnabled(email: string): boolean {
  return process.env.NODE_ENV !== "production" && getTestLoginAllowlist().has(normalizeEmail(email));
}

router.post("/auth/register", async (req, res): Promise<void> => {
  try {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { name, password, avatarUrl } = parsed.data;
    const email = normalizeEmail(parsed.data.email);

    let user: FallbackUser | undefined;

    try {
      const existing = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`);
      if (existing.length > 0) {
        res.status(400).json({ error: "Email already in use" });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const [inserted] = await db.insert(usersTable).values({ name, email, passwordHash, avatarUrl: avatarUrl ?? null }).returning();
      user = inserted;
    } catch (dbErr) {
      logger.warn({ err: dbErr }, "Database unreachable during register — using in-memory fallback");
      if (fallbackUsers.has(email)) {
        res.status(400).json({ error: "Email already in use" });
        return;
      }
      const passwordHash = await bcrypt.hash(password, 10);
      user = {
        id: ++fallbackIdCounter,
        name,
        email,
        passwordHash,
        avatarUrl: avatarUrl ?? null,
        bio: null,
        createdAt: new Date(),
      };
      fallbackUsers.set(email, user);
    }

    const token = signToken({ userId: user.id, email: user.email });
    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl ?? null,
        bio: user.bio ?? null,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (err: any) {
    logger.error({ err }, "Register error");
    res.status(500).json({ error: "Registration failed: " + (err?.message || "Internal error") });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  try {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const email = normalizeEmail(parsed.data.email);
    const { password } = parsed.data;

    let user: FallbackUser | undefined;

    try {
      const [found] = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`);
      user = found;
    } catch (dbErr) {
      logger.warn({ err: dbErr }, "Database query failed during login — checking fallback store");
      user = fallbackUsers.get(email);
    }

    // Auto-create user if in development or test login enabled or fallback mode
    if (!user && (isTestLoginEnabled(email) || process.env.NODE_ENV !== "production")) {
      const passwordHash = await bcrypt.hash(password || `test-login:${email}`, 4);
      try {
        const [inserted] = await db.insert(usersTable).values({
          name: email.split("@")[0] || email,
          email,
          passwordHash,
          avatarUrl: null,
        }).returning();
        user = inserted;
      } catch {
        user = {
          id: ++fallbackIdCounter,
          name: email.split("@")[0] || email,
          email,
          passwordHash,
          avatarUrl: null,
          bio: null,
          createdAt: new Date(),
        };
        fallbackUsers.set(email, user);
      }
    }

    if (!user) {
      res.status(401).json({ error: "Invalid email or password. Please check your credentials or click Request Access to register." });
      return;
    }

    // Validate password if user has passwordHash
    if (user.passwordHash && !isTestLoginEnabled(email)) {
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password. Please try again." });
        return;
      }
    }

    const token = signToken({ userId: user.id, email: user.email });
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl ?? null,
        bio: user.bio ?? null,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (err: any) {
    logger.error({ err }, "Login error");
    res.status(500).json({ error: "Login failed: " + (err?.message || "Internal error") });
  }
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.sendStatus(204);
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  try {
    let user: FallbackUser | undefined;
    try {
      const [found] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
      user = found;
    } catch {
      for (const u of fallbackUsers.values()) {
        if (u.id === req.userId) { user = u; break; }
      }
    }

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      createdAt: user.createdAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch current user" });
  }
});

export default router;
