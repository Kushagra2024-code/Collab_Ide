import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const aiSuggestionsTable = pgTable("ai_suggestions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  diff: text("diff").notNull(),
  filePath: text("file_path"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | edited
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export type AiSuggestion = typeof aiSuggestionsTable.$inferSelect;
