import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fileVersionsTable = pgTable("file_versions", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull(),
  content: text("content").notNull().default(""),
  authorId: integer("author_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFileVersionSchema = createInsertSchema(fileVersionsTable).omit({ id: true, createdAt: true });
export type InsertFileVersion = z.infer<typeof insertFileVersionSchema>;
export type FileVersion = typeof fileVersionsTable.$inferSelect;
