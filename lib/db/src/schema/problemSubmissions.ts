import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const problemSubmissionsTable = pgTable("problem_submissions", {
  id: serial("id").primaryKey(),
  problemId: integer("problem_id").notNull(),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  language: text("language").notNull(),
  code: text("code").notNull(),
  verdict: text("verdict").notNull().default("pending"), // pending | accepted | wrong_answer | tle | mle | runtime_error
  executionTimeMs: integer("execution_time_ms"),
  memoryKb: integer("memory_kb"),
  output: text("output"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProblemSubmission = typeof problemSubmissionsTable.$inferSelect;
