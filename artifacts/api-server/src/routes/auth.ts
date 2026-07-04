import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { signToken } from "../lib/auth";
import { normalizeEmail } from "../lib/email";
import { requireAuth } from "../middlewares/auth";
import {
  RegisterBody,
  RegisterResponse,
  LoginBody,
  LoginResponse,
  GetMeResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

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
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, password, avatarUrl } = parsed.data;
  const email = normalizeEmail(parsed.data.email);

  const existing = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`);
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({ name, email, passwordHash, avatarUrl: avatarUrl ?? null }).returning();

  const token = signToken({ userId: user.id, email: user.email });

  const response = RegisterResponse.parse({
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, bio: user.bio, createdAt: user.createdAt },
    token,
  });
  res.status(201).json(response);
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const { password } = parsed.data;

  let [user] = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`);

  if (!user && isTestLoginEnabled(email)) {
    const passwordHash = await bcrypt.hash(`test-login:${email}`, 4);
    [user] = await db.insert(usersTable).values({
      name: email.split("@")[0] || email,
      email,
      passwordHash,
      avatarUrl: null,
    }).returning();
  }

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!isTestLoginEnabled(email)) {
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
  }

  const token = signToken({ userId: user.id, email: user.email });
  const response = LoginResponse.parse({
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, bio: user.bio, createdAt: user.createdAt },
    token,
  });
  res.json(response);
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.sendStatus(204);
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(GetMeResponse.parse({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, bio: user.bio, createdAt: user.createdAt }));
});

export default router;
