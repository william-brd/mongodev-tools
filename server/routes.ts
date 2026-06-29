import type { Express } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { setupAuthRoutes, requireAuth, requireAdmin, currentUser } from "./auth/keycloak";
import { api } from "@shared/routes";
import { z } from "zod";
import { executeMongoScript } from "./lib/mongo";
import { dbg } from "./logger";

// Valida nomes de database e collection — evita acesso a nomes reservados ou path traversal
const DB_NAME_RE = /^[a-zA-Z0-9_\-]{1,64}$/;
const COL_NAME_RE = /^[a-zA-Z0-9_\-\.]{1,120}$/;
// Databases internos do MongoDB — acesso via browser bloqueado
const RESERVED_DBS = new Set(["admin", "config", "local"]);

function validateDbCol(db: string, col?: string): void {
  if (RESERVED_DBS.has(db.toLowerCase()))
    throw Object.assign(new Error(`Acesso ao database "${db}" não é permitido — database reservado do MongoDB`), { status: 403 });
  if (!DB_NAME_RE.test(db)) throw Object.assign(new Error(`Nome de database inválido: "${db}"`), { status: 400 });
  if (col !== undefined && !COL_NAME_RE.test(col)) throw Object.assign(new Error(`Nome de collection inválido: "${col}"`), { status: 400 });
}

// Sanitiza mensagens de erro para o cliente em produção
function clientError(e: any): string {
  if (process.env.NODE_ENV !== "production") return e.message;
  return "Operação falhou. Consulte os logs do servidor.";
}
import {
  listDatabases,
  listCollections,
  createCollection,
  dropCollection,
  getCollectionStats,
  getDatabaseStats,
  findDocuments,
  countDocuments,
  insertDocument,
  updateDocument,
  replaceDocument,
  deleteDocument,
  bulkDeleteDocuments,
  listIndexes,
  createIndex,
  dropIndex,
  exportToJson,
  exportToCsv,
  importDocuments,
  getServerStatus,
} from "./mongo/browser";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuthRoutes(app);

  // ── Scripts CRUD ──────────────────────────────────────────────

  app.get(api.scripts.list.path, requireAuth, async (_req, res) => {
    const scripts = await storage.getScripts();
    res.json(scripts);
  });

  app.get(api.scripts.get.path, requireAuth, async (req, res) => {
    const script = await storage.getScript(Number(req.params.id));
    if (!script) return res.status(404).json({ message: "Script not found" });
    res.json(script);
  });

  app.post(api.scripts.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.scripts.create.input.parse(req.body);
      const script = await storage.createScript(input);
      res.status(201).json(script);
    } catch (err) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.scripts.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.scripts.create.input.partial().parse(req.body);
      const script = await storage.updateScript(Number(req.params.id), input);
      res.json(script);
    } catch (err) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete(api.scripts.delete.path, requireAuth, async (req, res) => {
    await storage.deleteScript(Number(req.params.id));
    res.sendStatus(204);
  });

  // ── Script execution ──────────────────────────────────────────

  // Rate limiting: 30 execuções por minuto por usuário autenticado
  const executeRateLimit = rateLimit({
    windowMs: 60_000,
    max: 30,
    keyGenerator: (req) => {
      try { return currentUser(req).id; } catch { return req.ip ?? "anon"; }
    },
    handler: (_req, res) =>
      res.status(429).json({ message: "Muitas execuções. Aguarde antes de tentar novamente." }),
    standardHeaders: false, // não expor RateLimit-Remaining ao cliente
    legacyHeaders: false,
  });

  // Operações de escrita bloqueadas para usuários readonly.
  // Cobre os métodos diretos e estágios de aggregation que gravam dados.
  const WRITE_OPS =
    /\b(insertOne|insertMany|insert\s*\(|updateOne|updateMany|update\s*\(|replaceOne|deleteOne|deleteMany|remove\s*\(|drop\s*\(|dropCollection|dropDatabase|createCollection|createIndex|dropIndex|dropIndexes|renameCollection|rename\s*\(|findAndModify|findOneAndUpdate|findOneAndDelete|findOneAndReplace|bulkWrite|save\s*\(|copyTo|convertToCapped|\$out|\$merge|\$accumulator|\$function)/i;

  app.post(api.scripts.execute.path, requireAuth, executeRateLimit, async (req, res) => {
    const start = Date.now();
    try {
      const { code, type, dbName, scriptId } = req.body;
      dbg("[execute] body recebido:", { type, dbName, scriptId, codeLength: code?.length });

      const user = currentUser(req);
      if (user.role === "readonly" && WRITE_OPS.test(code)) {
        return res.status(403).json({
          message: "Permissão negada: usuário readonly não pode executar operações de escrita.",
        });
      }

      const result = await executeMongoScript(code, type, dbName);
      const durationMs = Date.now() - start;

      await storage.logExecution({
        scriptId: scriptId ?? null,
        code: code ?? null,
        status: "success",
        result,
        durationMs,
        executedBy: user.email || user.id,
      });

      res.json({ result, durationMs, status: "success" });
    } catch (error: any) {
      const durationMs = Date.now() - start;
      const user = currentUser(req);
      await storage.logExecution({
        scriptId: req.body?.scriptId ?? null,
        code: req.body?.code ?? null,
        status: "error",
        result: { error: error.message },
        durationMs,
        executedBy: user?.email || user?.id || null,
      });
      res.status(500).json({ message: error.message });
    }
  });

  // ── Executions ────────────────────────────────────────────────

  app.get(api.executions.list.path, requireAuth, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? "10"), 1), 100);
    const offset = Math.max(Number(req.query.offset ?? "0"), 0);
    const executions = await storage.getExecutionSummaries(limit, offset);
    res.json(executions);
  });

  app.get(api.executions.get.path, requireAuth, async (req, res) => {
    const execution = await storage.getExecution(Number(req.params.id));
    if (!execution) return res.status(404).json({ message: "Execution not found" });
    res.json(execution);
  });

  // ── MongoDB Browser ───────────────────────────────────────────

  app.get("/api/mongo/databases", requireAuth, async (_req, res) => {
    try {
      res.json(await listDatabases());
    } catch (e: any) {
      res.status(500).json({ message: clientError(e) });
    }
  });

  app.get("/api/mongo/server-status", requireAdmin, async (_req, res) => {
    try {
      res.json(await getServerStatus());
    } catch (e: any) {
      res.status(500).json({ message: clientError(e) });
    }
  });

  app.get("/api/mongo/databases/:db/stats", requireAuth, async (req, res) => {
    try {
      validateDbCol(req.params.db);
      res.json(await getDatabaseStats(req.params.db));
    } catch (e: any) {
      res.status(e.status ?? 500).json({ message: e.status ? e.message : clientError(e) });
    }
  });

  app.get("/api/mongo/databases/:db/collections", requireAuth, async (req, res) => {
    try {
      validateDbCol(req.params.db);
      res.json(await listCollections(req.params.db));
    } catch (e: any) {
      res.status(e.status ?? 500).json({ message: e.status ? e.message : clientError(e) });
    }
  });

  app.post("/api/mongo/databases/:db/collections", requireAdmin, async (req, res) => {
    try {
      validateDbCol(req.params.db);
      const name = req.body?.name;
      if (typeof name !== "string" || !name.trim())
        return res.status(400).json({ message: "Collection name must be a non-empty string" });
      validateDbCol(req.params.db, name);
      await createCollection(req.params.db, name);
      res.status(201).json({ ok: true });
    } catch (e: any) {
      res.status(e.status ?? 500).json({ message: e.status ? e.message : clientError(e) });
    }
  });

  app.delete("/api/mongo/databases/:db/collections/:col", requireAdmin, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      await dropCollection(req.params.db, req.params.col);
      res.sendStatus(204);
    } catch (e: any) {
      res.status(e.status ?? 500).json({ message: e.status ? e.message : clientError(e) });
    }
  });

  app.get("/api/mongo/databases/:db/collections/:col/stats", requireAuth, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      res.json(await getCollectionStats(req.params.db, req.params.col));
    } catch (e: any) {
      res.status(e.status ?? 500).json({ message: e.status ? e.message : clientError(e) });
    }
  });

  // ── Documents ─────────────────────────────────────────────────

  app.get("/api/mongo/databases/:db/collections/:col/documents", requireAuth, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      const result = await findDocuments(req.params.db, req.params.col, {
        filter: req.query.filter as string,
        sort: req.query.sort as string,
        projection: req.query.projection as string,
        limit: Number(req.query.limit ?? "50"),
        skip: Number(req.query.skip ?? "0"),
      });
      res.json(result);
    } catch (e: any) {
      res.status(e.status ?? 400).json({ message: e.message });
    }
  });

  app.get("/api/mongo/databases/:db/collections/:col/count", requireAuth, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      const count = await countDocuments(
        req.params.db,
        req.params.col,
        (req.query.filter as string) || "{}"
      );
      res.json({ count });
    } catch (e: any) {
      res.status(e.status ?? 400).json({ message: e.message });
    }
  });

  app.post("/api/mongo/databases/:db/collections/:col/documents", requireAdmin, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      const result = await insertDocument(req.params.db, req.params.col, req.body);
      res.status(201).json(result);
    } catch (e: any) {
      res.status(e.status ?? 400).json({ message: e.message });
    }
  });

  app.put("/api/mongo/databases/:db/collections/:col/documents/:id", requireAdmin, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      const result = await updateDocument(req.params.db, req.params.col, req.params.id, req.body);
      res.json(result);
    } catch (e: any) {
      res.status(e.status ?? 400).json({ message: e.message });
    }
  });

  app.put("/api/mongo/databases/:db/collections/:col/documents/:id/replace", requireAdmin, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      const result = await replaceDocument(req.params.db, req.params.col, req.params.id, req.body);
      res.json(result);
    } catch (e: any) {
      res.status(e.status ?? 400).json({ message: e.message });
    }
  });

  app.delete("/api/mongo/databases/:db/collections/:col/documents/:id", requireAdmin, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      const result = await deleteDocument(req.params.db, req.params.col, req.params.id);
      res.json(result);
    } catch (e: any) {
      res.status(e.status ?? 400).json({ message: e.message });
    }
  });

  app.post("/api/mongo/databases/:db/collections/:col/documents/bulk-delete", requireAdmin, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      const { ids } = req.body as { ids: string[] };
      if (!Array.isArray(ids)) return res.status(400).json({ message: "ids must be an array" });
      const result = await bulkDeleteDocuments(req.params.db, req.params.col, ids);
      res.json(result);
    } catch (e: any) {
      res.status(e.status ?? 400).json({ message: e.message });
    }
  });

  // ── Indexes ───────────────────────────────────────────────────

  app.get("/api/mongo/databases/:db/collections/:col/indexes", requireAuth, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      res.json(await listIndexes(req.params.db, req.params.col));
    } catch (e: any) {
      res.status(e.status ?? 500).json({ message: e.status ? e.message : clientError(e) });
    }
  });

  app.post("/api/mongo/databases/:db/collections/:col/indexes", requireAdmin, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      const { keys, name, unique, sparse } = req.body;
      if (!keys || typeof keys !== "object" || Array.isArray(keys) || Object.keys(keys).length === 0)
        return res.status(400).json({ message: "keys must be a non-empty object (e.g. {field: 1})" });
      if (name !== undefined && typeof name !== "string")
        return res.status(400).json({ message: "name must be a string" });
      const result = await createIndex(req.params.db, req.params.col, keys, {
        name: typeof name === "string" ? name : undefined,
        unique: unique === true,
        sparse: sparse === true,
      });
      res.status(201).json(result);
    } catch (e: any) {
      res.status(e.status ?? 400).json({ message: e.message });
    }
  });

  app.delete("/api/mongo/databases/:db/collections/:col/indexes/:indexName", requireAdmin, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      await dropIndex(req.params.db, req.params.col, req.params.indexName);
      res.sendStatus(204);
    } catch (e: any) {
      res.status(e.status ?? 400).json({ message: e.message });
    }
  });

  // ── Export ────────────────────────────────────────────────────

  app.get("/api/mongo/databases/:db/collections/:col/export", requireAuth, async (req, res) => {
    const { format = "json", filter = "{}" } = req.query as Record<string, string>;
    const { db, col } = req.params;
    try { validateDbCol(db, col); } catch (e: any) { return res.status(400).json({ message: e.message }); }
    const ts = new Date().toISOString().replace(/[:.]/g, "-");

    try {
      if (format === "csv") {
        const csv = await exportToCsv(db, col, filter);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${col}-${ts}.csv"`);
        res.send(csv);
      } else {
        const json = await exportToJson(db, col, filter);
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="${col}-${ts}.json"`);
        res.send(json);
      }
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Import ────────────────────────────────────────────────────

  app.post("/api/mongo/databases/:db/collections/:col/import", requireAdmin, async (req, res) => {
    try {
      validateDbCol(req.params.db, req.params.col);
      const { documents, mode = "insert" } = req.body as {
        documents: unknown[];
        mode?: "insert" | "upsert";
      };
      if (!Array.isArray(documents))
        return res.status(400).json({ message: "documents must be an array" });
      const result = await importDocuments(req.params.db, req.params.col, documents, mode);
      res.json(result);
    } catch (e: any) {
      res.status(e.status ?? 400).json({ message: e.message });
    }
  });

  return httpServer;
}
