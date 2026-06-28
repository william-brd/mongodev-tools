import { EntitySchema } from "typeorm";

export interface ExecutionRow {
  id: number;
  scriptId: number | null;
  code: string | null;
  status: string;
  result: unknown;
  executedAt: Date;
  durationMs: number;
  executedBy: string | null;
}

// Oracle não suporta "text" — usa CLOB para colunas de texto longo.
// simple-json internamente também depende de "text", então usamos clob + transformer manual.
function largeText() {
  const v = (process.env.DATABASE_VENDOR || "postgresql").toLowerCase();
  return v === "oracle" ? "clob" : "text";
}

const jsonTransformer = {
  to: (v: unknown) => (v !== undefined && v !== null ? JSON.stringify(v) : null),
  from: (v: string | null) => {
    try { return v ? JSON.parse(v) : null; } catch { return v; }
  },
};

export const ExecutionEntity = new EntitySchema<ExecutionRow>({
  name: "Execution",
  tableName: "executions",
  columns: {
    id: { type: Number, primary: true, generated: true },
    scriptId: { name: "script_id", type: Number, nullable: true },
    code: { name: "code", type: largeText() as any, nullable: true },
    status: { type: String },
    result: {
      type: largeText() as any,
      nullable: true,
      transformer: jsonTransformer,
    },
    executedAt: { name: "executed_at", type: Date, createDate: true },
    durationMs: { name: "duration_ms", type: Number, default: 0 },
    executedBy: { name: "executed_by", type: String, nullable: true },
  },
});
