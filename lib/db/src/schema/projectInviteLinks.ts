import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const projectInviteLinksTable = pgTable("project_invite_links", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  token: text("token").notNull().unique(),
  role: text("role").notNull().default("editor"),
  createdById: integer("created_by_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectInviteLink = typeof projectInviteLinksTable.$inferSelect;
