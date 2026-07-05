import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const chatChannelsTable = pgTable("chat_channels", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("channel"), // channel | dm
  createdById: integer("created_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatChannel = typeof chatChannelsTable.$inferSelect;
