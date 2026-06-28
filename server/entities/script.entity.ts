import { EntitySchema } from "typeorm";

export interface ScriptRow {
  id: number;
  name: string;
  description: string | null;
  code: string;
  type: string;
  isReadonly: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

// Oracle não suporta "text" — usa CLOB para colunas de texto longo
function largeText() {
  const v = (process.env.DATABASE_VENDOR || "postgresql").toLowerCase();
  return v === "oracle" ? "clob" : "text";
}

export const ScriptEntity = new EntitySchema<ScriptRow>({
  name: "Script",
  tableName: "scripts",
  columns: {
    id: { type: Number, primary: true, generated: true },
    name: { type: String },
    description: { type: String, nullable: true },
    code: { type: largeText() as any },
    type: { type: String, default: "query" },
    isReadonly: { name: "is_readonly", type: Boolean, nullable: true, default: true },
    createdAt: { name: "created_at", type: Date, createDate: true },
    updatedAt: { name: "updated_at", type: Date, updateDate: true },
  },
});
