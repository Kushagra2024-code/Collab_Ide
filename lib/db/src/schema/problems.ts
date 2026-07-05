import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const problemsTable = pgTable("problems", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  title: text("title").notNull(),
  statement: text("statement").notNull(),
  constraints: text("constraints"),
  examples: text("examples"), // JSON array
  notes: text("notes"),
  hiddenTests: text("hidden_tests"), // JSON array
  codeTemplates: text("code_templates"), // JSON object lang -> template
  supportedLanguages: text("supported_languages"), // JSON array
  createdById: integer("created_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Problem = typeof problemsTable.$inferSelect;
