import { db } from "./db";
import {
  scripts,
  executions,
  type InsertScript,
  type InsertExecution,
  type Script,
  type Execution,
  type ExecutionSummary,
} from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  getScripts(): Promise<Script[]>;
  getScript(id: number): Promise<Script | undefined>;
  createScript(script: InsertScript): Promise<Script>;
  updateScript(id: number, script: Partial<InsertScript>): Promise<Script>;
  deleteScript(id: number): Promise<void>;

  getExecutions(limit?: number, offset?: number): Promise<Execution[]>;
  getExecution(id: number): Promise<Execution | undefined>;
  getExecutionSummaries(
    limit?: number,
    offset?: number
  ): Promise<ExecutionSummary[]>;
  logExecution(execution: InsertExecution): Promise<Execution>;
}

export class DatabaseStorage implements IStorage {
  async getScripts(): Promise<Script[]> {
    return await db.select().from(scripts).orderBy(desc(scripts.createdAt));
  }

  async getScript(id: number): Promise<Script | undefined> {
    const [script] = await db.select().from(scripts).where(eq(scripts.id, id));
    return script;
  }

  async createScript(insertScript: InsertScript): Promise<Script> {
    const [script] = await db.insert(scripts).values(insertScript).returning();
    return script;
  }

  async updateScript(
    id: number,
    updates: Partial<InsertScript>
  ): Promise<Script> {
    const [script] = await db
      .update(scripts)
      .set(updates)
      .where(eq(scripts.id, id))
      .returning();
    return script;
  }

  async deleteScript(id: number): Promise<void> {
    await db.delete(scripts).where(eq(scripts.id, id));
  }

  async getExecutions(limit = 10, offset = 0): Promise<Execution[]> {
    return await db
      .select()
      .from(executions)
      .orderBy(desc(executions.executedAt))
      .limit(limit)
      .offset(offset);
  }

  async getExecution(id: number): Promise<Execution | undefined> {
    const [execution] = await db
      .select()
      .from(executions)
      .where(eq(executions.id, id));
    return execution;
  }

  async getExecutionSummaries(
    limit = 10,
    offset = 0
  ): Promise<ExecutionSummary[]> {
    const rows = await db
      .select({
        id: executions.id,
        scriptId: executions.scriptId,
        status: executions.status,
        executedAt: executions.executedAt,
        durationMs: executions.durationMs,
        resultPreview: sql<
          string | null
        >`left(${executions.result}::text, 300)`,
      })
      .from(executions)
      .orderBy(desc(executions.executedAt))
      .limit(limit)
      .offset(offset);
    return rows;
  }

  async logExecution(insertExecution: InsertExecution): Promise<Execution> {
    const [execution] = await db
      .insert(executions)
      .values(insertExecution)
      .returning();
    return execution;
  }
}

export const storage = new DatabaseStorage();
