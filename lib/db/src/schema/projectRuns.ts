import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const projectRunsTable = pgTable("project_runs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  command: text("command").notNull(),
  status: text("status").notNull().default("running"), // running | stopped | completed | failed
  port: integer("port"),
  output: text("output").default(""),
  errorOutput: text("error_output").default(""),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type ProjectRun = typeof projectRunsTable.$inferSelect;
