import {
  type InsertScript,
  type InsertExecution,
  type Script,
  type Execution,
  type ExecutionSummary,
} from "@shared/schema";

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

export class MemoryStorage implements IStorage {
  private scripts: Script[] = [];
  private executions: Execution[] = [];
  private nextScriptId = 1;
  private nextExecId = 1;

  async getScripts() {
    return [...this.scripts].reverse();
  }

  async getScript(id: number) {
    return this.scripts.find((s) => s.id === id);
  }

  async createScript(data: InsertScript): Promise<Script> {
    const script: Script = {
      id: this.nextScriptId++,
      name: data.name,
      description: data.description ?? null,
      code: data.code,
      type: data.type,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.scripts.push(script);
    return script;
  }

  async updateScript(id: number, updates: Partial<InsertScript>): Promise<Script> {
    const idx = this.scripts.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error("Script not found");
    this.scripts[idx] = { ...this.scripts[idx], ...updates, updatedAt: new Date() };
    return this.scripts[idx];
  }

  async deleteScript(id: number) {
    this.scripts = this.scripts.filter((s) => s.id !== id);
  }

  async getExecutions(limit = 10, offset = 0) {
    return [...this.executions].reverse().slice(offset, offset + limit);
  }

  async getExecution(id: number) {
    return this.executions.find((e) => e.id === id);
  }

  async getExecutionSummaries(limit = 10, offset = 0): Promise<ExecutionSummary[]> {
    return [...this.executions]
      .reverse()
      .slice(offset, offset + limit)
      .map((e) => ({
        id: e.id,
        scriptId: e.scriptId ?? null,
        status: e.status,
        executedAt: e.executedAt,
        durationMs: e.durationMs,
        resultPreview: JSON.stringify(e.result ?? "").slice(0, 300),
      }));
  }

  async logExecution(data: InsertExecution): Promise<Execution> {
    const execution: Execution = {
      id: this.nextExecId++,
      scriptId: data.scriptId ?? null,
      status: data.status,
      result: data.result as any,
      durationMs: data.durationMs,
      executedAt: new Date(),
    };
    this.executions.push(execution);
    return execution;
  }
}

export class DatabaseStorage implements IStorage {
  private _db: any = null;
  private _initError: string | null = null;
  private _fallback = new MemoryStorage();

  async init() {
    try {
      const { db } = await import("./db");
      await db.execute("select 1" as any);
      this._db = db;
      console.log("[storage] PostgreSQL conectado");
    } catch (e: any) {
      this._initError = e.message;
      console.warn(`[storage] PostgreSQL indisponível (${e.message}) — usando memória`);
    }
  }

  private get db() {
    if (!this._db) throw new Error("pg_unavailable");
    return this._db;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    if (!this._db) return fn.call(this._fallback);
    try {
      return await fn();
    } catch (e: any) {
      if (e.message === "pg_unavailable" || e.code === "ECONNREFUSED") {
        return fn.call(this._fallback);
      }
      throw e;
    }
  }

  async getScripts() {
    if (!this._db) return this._fallback.getScripts();
    const { db, scripts } = await import("./db").then(async (m) => ({
      db: m.db,
      scripts: (await import("@shared/schema")).scripts,
    }));
    const { desc } = await import("drizzle-orm");
    return db.select().from(scripts).orderBy(desc(scripts.createdAt));
  }

  async getScript(id: number) {
    if (!this._db) return this._fallback.getScript(id);
    const { db, scripts } = await import("./db").then(async (m) => ({
      db: m.db,
      scripts: (await import("@shared/schema")).scripts,
    }));
    const { eq } = await import("drizzle-orm");
    const [s] = await db.select().from(scripts).where(eq(scripts.id, id));
    return s;
  }

  async createScript(data: InsertScript) {
    if (!this._db) return this._fallback.createScript(data);
    const { db, scripts } = await import("./db").then(async (m) => ({
      db: m.db,
      scripts: (await import("@shared/schema")).scripts,
    }));
    const [s] = await db.insert(scripts).values(data).returning();
    return s;
  }

  async updateScript(id: number, updates: Partial<InsertScript>) {
    if (!this._db) return this._fallback.updateScript(id, updates);
    const { db, scripts } = await import("./db").then(async (m) => ({
      db: m.db,
      scripts: (await import("@shared/schema")).scripts,
    }));
    const { eq } = await import("drizzle-orm");
    const [s] = await db.update(scripts).set(updates).where(eq(scripts.id, id)).returning();
    return s;
  }

  async deleteScript(id: number) {
    if (!this._db) return this._fallback.deleteScript(id);
    const { db, scripts } = await import("./db").then(async (m) => ({
      db: m.db,
      scripts: (await import("@shared/schema")).scripts,
    }));
    const { eq } = await import("drizzle-orm");
    await db.delete(scripts).where(eq(scripts.id, id));
  }

  async getExecutions(limit = 10, offset = 0) {
    if (!this._db) return this._fallback.getExecutions(limit, offset);
    const { db, executions } = await import("./db").then(async (m) => ({
      db: m.db,
      executions: (await import("@shared/schema")).executions,
    }));
    const { desc } = await import("drizzle-orm");
    return db.select().from(executions).orderBy(desc(executions.executedAt)).limit(limit).offset(offset);
  }

  async getExecution(id: number) {
    if (!this._db) return this._fallback.getExecution(id);
    const { db, executions } = await import("./db").then(async (m) => ({
      db: m.db,
      executions: (await import("@shared/schema")).executions,
    }));
    const { eq } = await import("drizzle-orm");
    const [e] = await db.select().from(executions).where(eq(executions.id, id));
    return e;
  }

  async getExecutionSummaries(limit = 10, offset = 0): Promise<ExecutionSummary[]> {
    if (!this._db) return this._fallback.getExecutionSummaries(limit, offset);
    const { db, executions } = await import("./db").then(async (m) => ({
      db: m.db,
      executions: (await import("@shared/schema")).executions,
    }));
    const { desc, sql } = await import("drizzle-orm");
    return db
      .select({
        id: executions.id,
        scriptId: executions.scriptId,
        status: executions.status,
        executedAt: executions.executedAt,
        durationMs: executions.durationMs,
        resultPreview: sql<string | null>`left(${executions.result}::text, 300)`,
      })
      .from(executions)
      .orderBy(desc(executions.executedAt))
      .limit(limit)
      .offset(offset);
  }

  async logExecution(data: InsertExecution) {
    if (!this._db) return this._fallback.logExecution(data);
    const { db, executions } = await import("./db").then(async (m) => ({
      db: m.db,
      executions: (await import("@shared/schema")).executions,
    }));
    const [e] = await db.insert(executions).values(data).returning();
    return e;
  }
}

export const storage = new DatabaseStorage();
