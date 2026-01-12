import { pgTable, text, serial, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const scripts = pgTable("scripts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  code: text("code").notNull(), // The script or query
  type: text("type").notNull().default("query"), // 'query' or 'aggregation'
  isReadonly: boolean("is_readonly").default(true), // If true, only read operations allowed
  createdAt: timestamp("created_at").defaultNow(),
});

export const executions = pgTable("executions", {
  id: serial("id").primaryKey(),
  scriptId: serial("script_id").references(() => scripts.id),
  status: text("status").notNull(), // 'success', 'error'
  result: jsonb("result"),
  executedAt: timestamp("executed_at").defaultNow(),
  durationMs: serial("duration_ms"),
});

export const insertScriptSchema = createInsertSchema(scripts).omit({ 
  id: true, 
  createdAt: true 
});

export const insertExecutionSchema = createInsertSchema(executions).omit({ 
  id: true, 
  executedAt: true 
});

export type Script = typeof scripts.$inferSelect;
export type InsertScript = z.infer<typeof insertScriptSchema>;
export type Execution = typeof executions.$inferSelect;
export type InsertExecution = z.infer<typeof insertExecutionSchema>;

export type ExecuteScriptRequest = {
  scriptId?: number;
  code?: string; // Allow ad-hoc execution
  type: "query" | "aggregation";
};
