import { db } from "./db";
import {
  scripts,
  executions,
  type InsertScript,
  type InsertExecution,
  type Script,
  type Execution,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getScripts(): Promise<Script[]>;
  getScript(id: number): Promise<Script | undefined>;
  createScript(script: InsertScript): Promise<Script>;
  updateScript(id: number, script: Partial<InsertScript>): Promise<Script>;
  deleteScript(id: number): Promise<void>;

  getExecutions(limit?: number, offset?: number): Promise<Execution[]>;
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

  async logExecution(insertExecution: InsertExecution): Promise<Execution> {
    const [execution] = await db
      .insert(executions)
      .values(insertExecution)
      .returning();
    return execution;
  }
}

export const storage = new DatabaseStorage();
