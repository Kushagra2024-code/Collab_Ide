import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const projectDocumentationTable = pgTable("project_documentation", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  docType: text("doc_type").notNull(), // readme | api | architecture | setup | deployment | changelog | folder_structure
  content: text("content").notNull().default(""),
  generatedBy: text("generated_by").default("ai"), // ai | manual
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("project_documentation_project_type_idx").on(t.projectId, t.docType),
]);

export type ProjectDocumentation = typeof projectDocumentationTable.$inferSelect;
