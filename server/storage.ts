import { AppDataSource } from "./db";
import { ScriptEntity, type ScriptRow } from "./entities/script.entity";
import { ExecutionEntity, type ExecutionRow } from "./entities/execution.entity";
import type { InsertScript, InsertExecution, Script, Execution, ExecutionSummary } from "@shared/schema";
import { isDebug, dbg } from "./logger";

export interface IStorage {
  getScripts(): Promise<Script[]>;
  getScript(id: number): Promise<Script | undefined>;
  createScript(script: InsertScript): Promise<Script>;
  updateScript(id: number, script: Partial<InsertScript>): Promise<Script>;
  deleteScript(id: number): Promise<void>;

  getExecutions(limit?: number, offset?: number): Promise<Execution[]>;
  getExecution(id: number): Promise<Execution | undefined>;
  getExecutionSummaries(limit?: number, offset?: number): Promise<ExecutionSummary[]>;
  logExecution(execution: InsertExecution): Promise<Execution>;
}

export class MemoryStorage implements IStorage {
  private scripts: Script[] = [];
  private executions: Execution[] = [];
  private nextScriptId = 1;
  private nextExecId = 1;

  async getScripts() { return [...this.scripts].reverse(); }
  async getScript(id: number) { return this.scripts.find((s) => s.id === id); }

  async createScript(data: InsertScript): Promise<Script> {
    const script: Script = {
      id: this.nextScriptId++,
      name: data.name,
      description: data.description ?? null,
      code: data.code,
      type: data.type ?? "query",
      isReadonly: data.isReadonly ?? null,
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

  async deleteScript(id: number) { this.scripts = this.scripts.filter((s) => s.id !== id); }

  async getExecutions(limit = 10, offset = 0) {
    return [...this.executions].reverse().slice(offset, offset + limit);
  }

  async getExecution(id: number) { return this.executions.find((e) => e.id === id); }

  async getExecutionSummaries(limit = 10, offset = 0): Promise<ExecutionSummary[]> {
    return [...this.executions]
      .reverse()
      .slice(offset, offset + limit)
      .map((e) => ({
        id: e.id,
        scriptId: e.scriptId ?? null,
        code: e.code ?? null,
        status: e.status,
        executedAt: e.executedAt,
        durationMs: e.durationMs,
        executedBy: e.executedBy ?? null,
        resultPreview: JSON.stringify(e.result ?? "").slice(0, 300),
      }));
  }

  async logExecution(data: InsertExecution): Promise<Execution> {
    const execution: Execution = {
      id: this.nextExecId++,
      scriptId: data.scriptId ?? null,
      code: data.code ?? null,
      status: data.status,
      result: data.result as any,
      durationMs: data.durationMs ?? 0,
      executedAt: new Date(),
      executedBy: data.executedBy ?? null,
    };
    this.executions.push(execution);
    return execution;
  }
}

export class DatabaseStorage implements IStorage {
  private _ready = false;
  private _fallback = new MemoryStorage();

  async init() {
    const vendor = (process.env.DATABASE_VENDOR || "postgresql").toLowerCase();
    const schema = process.env.DATABASE_SCHEMA || "mongo_tools";

    const maskPw = (v?: string) => v ? `${v.slice(0, 2)}***` : "(não definido)";
    const maskUrl = (v?: string) => v?.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@") ?? "(não definido)";

    const connHint = process.env.DATABASE_URL
      ? `url=${maskUrl(process.env.DATABASE_URL)}`
      : `host=${process.env.DATABASE_HOST ?? "(não definido)"}`;

    console.log(`[storage] iniciando — vendor=${vendor} schema=${schema} ${connHint} (LOG_LEVEL=${process.env.LOG_LEVEL ?? "info"})`);

    if (isDebug) {
      dbg("[storage] variáveis de conexão:", {
        DATABASE_VENDOR:       process.env.DATABASE_VENDOR       ?? "(não definido)",
        DATABASE_URL:          maskUrl(process.env.DATABASE_URL),
        DATABASE_HOST:         process.env.DATABASE_HOST         ?? "(não definido)",
        DATABASE_PORT:         process.env.DATABASE_PORT         ?? "(não definido)",
        DATABASE_NAME:         process.env.DATABASE_NAME         ?? "(não definido)",
        DATABASE_SERVICE_NAME: process.env.DATABASE_SERVICE_NAME ?? "(não definido)",
        DATABASE_SID:          process.env.DATABASE_SID          ?? "(não definido)",
        DATABASE_USER:         process.env.DATABASE_USER         ?? "(não definido)",
        DATABASE_PASSWORD:     maskPw(process.env.DATABASE_PASSWORD),
        DATABASE_SCHEMA:       process.env.DATABASE_SCHEMA       ?? "(não definido — padrão: mongo_tools)",
      });
    }

    try {
      await AppDataSource.initialize();
      await this._ensureSchema();
      await AppDataSource.synchronize();
      this._ready = true;
      console.log(`[storage] conectado — vendor: ${vendor}, schema: ${schema}`);
    } catch (e: any) {
      console.error(`[storage] banco indisponível (${e.message}) — usando memória`);
      if (isDebug) {
        console.error("[storage][debug] stack completo:", e.stack);
      }
    }
  }

  private async _ensureSchema() {
    const schema = process.env.DATABASE_SCHEMA || "mongo_tools";
    const vendor = (process.env.DATABASE_VENDOR || "postgresql").toLowerCase();

    if (vendor === "postgresql" || vendor === "postgres") {
      dbg(`[storage] executando: CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await AppDataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      console.log(`[storage] schema "${schema}" pronto (PostgreSQL)`);
    } else if (vendor === "mssql") {
      dbg(`[storage] executando: CREATE SCHEMA [${schema}] se não existir`);
      await AppDataSource.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '${schema}')
          EXEC('CREATE SCHEMA [${schema}]')
      `);
      console.log(`[storage] schema "${schema}" pronto (MSSQL)`);
    } else if (vendor === "oracle") {
      console.log(`[storage] Oracle: usando schema "${schema}" — deve existir no banco`);
    }
  }

  private scripts() { return AppDataSource.getRepository<ScriptRow>(ScriptEntity); }
  private executions() { return AppDataSource.getRepository<ExecutionRow>(ExecutionEntity); }

  async getScripts(): Promise<Script[]> {
    if (!this._ready) return this._fallback.getScripts();
    try {
      const rows = await this.scripts().find({ order: { createdAt: "DESC" } });
      return rows as unknown as Script[];
    } catch { return this._fallback.getScripts(); }
  }

  async getScript(id: number): Promise<Script | undefined> {
    if (!this._ready) return this._fallback.getScript(id);
    try {
      const row = await this.scripts().findOneBy({ id } as any);
      return row as unknown as Script | undefined;
    } catch { return this._fallback.getScript(id); }
  }

  async createScript(data: InsertScript): Promise<Script> {
    if (!this._ready) {
      dbg("[storage] createScript → memória (banco não pronto)");
      return this._fallback.createScript(data);
    }
    try {
      dbg("[storage] createScript → banco", { name: data.name });
      const row = await this.scripts().save({ ...data } as any);
      return row as unknown as Script;
    } catch (e: any) {
      console.error(`[storage] createScript falhou (${e.message}) — usando memória`);
      if (isDebug) console.error("[storage][debug] stack:", e.stack);
      return this._fallback.createScript(data);
    }
  }

  async updateScript(id: number, updates: Partial<InsertScript>): Promise<Script> {
    if (!this._ready) return this._fallback.updateScript(id, updates);
    try {
      await this.scripts().update(id, updates as any);
      const row = await this.scripts().findOneBy({ id } as any);
      if (!row) throw new Error("Script not found");
      return row as unknown as Script;
    } catch (e: any) {
      if (e.message === "Script not found") throw e;
      return this._fallback.updateScript(id, updates);
    }
  }

  async deleteScript(id: number): Promise<void> {
    if (!this._ready) return this._fallback.deleteScript(id);
    try {
      await this.scripts().delete(id);
    } catch { return this._fallback.deleteScript(id); }
  }

  async getExecutions(limit = 10, offset = 0): Promise<Execution[]> {
    if (!this._ready) return this._fallback.getExecutions(limit, offset);
    try {
      const rows = await this.executions().find({
        order: { executedAt: "DESC" },
        take: limit,
        skip: offset,
      });
      return rows as unknown as Execution[];
    } catch { return this._fallback.getExecutions(limit, offset); }
  }

  async getExecution(id: number): Promise<Execution | undefined> {
    if (!this._ready) return this._fallback.getExecution(id);
    try {
      const row = await this.executions().findOneBy({ id } as any);
      return row as unknown as Execution | undefined;
    } catch { return this._fallback.getExecution(id); }
  }

  async getExecutionSummaries(limit = 10, offset = 0): Promise<ExecutionSummary[]> {
    if (!this._ready) return this._fallback.getExecutionSummaries(limit, offset);
    try {
      const rows = await this.executions().find({
        order: { executedAt: "DESC" },
        take: limit,
        skip: offset,
      });
      return rows.map((e) => ({
        id: e.id,
        scriptId: e.scriptId ?? null,
        code: e.code ?? null,
        status: e.status,
        executedAt: e.executedAt,
        durationMs: e.durationMs,
        executedBy: e.executedBy ?? null,
        resultPreview: JSON.stringify(e.result ?? "").slice(0, 300),
      }));
    } catch { return this._fallback.getExecutionSummaries(limit, offset); }
  }

  async logExecution(data: InsertExecution): Promise<Execution> {
    if (!this._ready) {
      dbg("[storage] logExecution → memória (banco não pronto)");
      return this._fallback.logExecution(data);
    }
    try {
      dbg("[storage] logExecution → banco", { scriptId: data.scriptId, executedBy: data.executedBy, status: data.status });
      const row = await this.executions().save({ ...data } as any);
      return row as unknown as Execution;
    } catch (e: any) {
      console.error(`[storage] logExecution falhou (${e.message}) — usando memória`);
      if (isDebug) console.error("[storage][debug] stack:", e.stack);
      return this._fallback.logExecution(data);
    }
  }
}

export const storage = new DatabaseStorage();
