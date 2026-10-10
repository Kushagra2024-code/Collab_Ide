import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const requiresSsl = process.env.NODE_ENV === "production" ||
  Boolean(process.env.DATABASE_URL.includes("render.com") ||
  process.env.DATABASE_URL.includes("amazonaws.com") ||
  process.env.DATABASE_URL.includes("neon.tech") ||
  process.env.DATABASE_URL.includes("sslmode=require"));

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
  },
});
