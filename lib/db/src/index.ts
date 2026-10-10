import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/collabide";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. Using local default connection string.");
}

const requiresSsl = process.env.NODE_ENV === "production" ||
  Boolean(connectionString.includes("render.com") ||
  connectionString.includes("amazonaws.com") ||
  connectionString.includes("neon.tech") ||
  connectionString.includes("sslmode=require") ||
  process.env.PGSSLMODE === "require");

export const pool = new Pool({
  connectionString,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
