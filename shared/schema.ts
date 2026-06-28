import { z } from "zod";

export * from "./models/auth";

// ── Types ────────────────────────────────────────────────────────────────────

export type Script = {
  id: number;
  name: string;
  description: string | null;
  code: string;
  type: string;
  isReadonly: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type Execution = {
  id: number;
  scriptId: number | null;
  code: string | null;
  status: string;
  result: unknown;
  executedAt: Date | null;
  durationMs: number;
  executedBy: string | null;
};

export type ExecutionSummary = Omit<Execution, "result"> & {
  resultPreview: string | null;
};

export type ExecuteScriptRequest = {
  scriptId?: number;
  code?: string;
  type: "query" | "aggregation";
};

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const insertScriptSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  code: z.string().min(1),
  type: z.string().default("query"),
  isReadonly: z.boolean().optional(),
});

export const insertExecutionSchema = z.object({
  scriptId: z.number().nullable().optional(),
  code: z.string().nullable().optional(),
  status: z.string(),
  result: z.unknown().optional(),
  durationMs: z.number().default(0),
  executedBy: z.string().nullable().optional(),
});

export type InsertScript = z.infer<typeof insertScriptSchema>;
export type InsertExecution = z.infer<typeof insertExecutionSchema>;
