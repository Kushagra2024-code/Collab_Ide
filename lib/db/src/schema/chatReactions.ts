import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const chatReactionsTable = pgTable("chat_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  userId: integer("user_id").notNull(),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("chat_reactions_user_msg_emoji_idx").on(t.messageId, t.userId, t.emoji),
]);

export type ChatReaction = typeof chatReactionsTable.$inferSelect;
