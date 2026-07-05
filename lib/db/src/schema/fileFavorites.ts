import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const fileFavoritesTable = pgTable("file_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  projectId: integer("project_id").notNull(),
  fileId: integer("file_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("file_favorites_user_file_idx").on(t.userId, t.fileId),
]);

export type FileFavorite = typeof fileFavoritesTable.$inferSelect;
