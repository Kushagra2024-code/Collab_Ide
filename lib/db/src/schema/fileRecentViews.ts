import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const fileRecentViewsTable = pgTable("file_recent_views", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  projectId: integer("project_id").notNull(),
  fileId: integer("file_id").notNull(),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("file_recent_views_user_file_idx").on(t.userId, t.fileId),
]);

export type FileRecentView = typeof fileRecentViewsTable.$inferSelect;
