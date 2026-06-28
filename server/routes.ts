import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuthRoutes, requireAuth, requireAdmin, currentUser } from "./auth/keycloak";
import { api } from "@shared/routes";
import { z } from "zod";
import { executeMongoScript } from "./lib/mongo";
import { dbg } from "./logger";
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
    const script = await storage.updateScript(Number(req.params.id), req.body);
    res.json(script);
  });

  app.delete(api.scripts.delete.path, requireAuth, async (req, res) => {
    await storage.deleteScript(Number(req.params.id));
    res.sendStatus(204);
  });

  // ── Script execution ──────────────────────────────────────────

  // Operações de escrita bloqueadas para usuários readonly
  const WRITE_OPS =
    /\b(insertOne|insertMany|insert\s*\(|updateOne|updateMany|update\s*\(|replaceOne|deleteOne|deleteMany|remove\s*\(|drop\s*\(|dropCollection|dropDatabase|createCollection|createIndex|dropIndex|dropIndexes|renameCollection|rename\s*\(|findAndModify|findOneAndUpdate|findOneAndDelete|findOneAndReplace|bulkWrite|save\s*\(|copyTo|convertToCapped|\$out|\$merge)/i;

  app.post(api.scripts.execute.path, requireAuth, async (req, res) => {
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
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/mongo/server-status", requireAdmin, async (_req, res) => {
    try {
      res.json(await getServerStatus());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/mongo/databases/:db/stats", requireAuth, async (req, res) => {
    try {
      res.json(await getDatabaseStats(req.params.db));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/mongo/databases/:db/collections", requireAuth, async (req, res) => {
    try {
      res.json(await listCollections(req.params.db));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/mongo/databases/:db/collections", requireAdmin, async (req, res) => {
    try {
      await createCollection(req.params.db, req.body.name);
      res.status(201).json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/mongo/databases/:db/collections/:col", requireAdmin, async (req, res) => {
    try {
      await dropCollection(req.params.db, req.params.col);
      res.sendStatus(204);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/mongo/databases/:db/collections/:col/stats", requireAuth, async (req, res) => {
    try {
      res.json(await getCollectionStats(req.params.db, req.params.col));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Documents ─────────────────────────────────────────────────

  app.get("/api/mongo/databases/:db/collections/:col/documents", requireAuth, async (req, res) => {
    try {
      const result = await findDocuments(req.params.db, req.params.col, {
        filter: req.query.filter as string,
        sort: req.query.sort as string,
        projection: req.query.projection as string,
        limit: Number(req.query.limit ?? "50"),
        skip: Number(req.query.skip ?? "0"),
      });
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/mongo/databases/:db/collections/:col/count", requireAuth, async (req, res) => {
    try {
      const count = await countDocuments(
        req.params.db,
        req.params.col,
        (req.query.filter as string) || "{}"
      );
      res.json({ count });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/mongo/databases/:db/collections/:col/documents", requireAdmin, async (req, res) => {
    try {
      const result = await insertDocument(req.params.db, req.params.col, req.body);
      res.status(201).json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.put("/api/mongo/databases/:db/collections/:col/documents/:id", requireAdmin, async (req, res) => {
    try {
      const result = await updateDocument(req.params.db, req.params.col, req.params.id, req.body);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.put("/api/mongo/databases/:db/collections/:col/documents/:id/replace", requireAdmin, async (req, res) => {
    try {
      const result = await replaceDocument(req.params.db, req.params.col, req.params.id, req.body);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/mongo/databases/:db/collections/:col/documents/:id", requireAdmin, async (req, res) => {
    try {
      const result = await deleteDocument(req.params.db, req.params.col, req.params.id);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/mongo/databases/:db/collections/:col/documents/bulk-delete", requireAdmin, async (req, res) => {
    try {
      const { ids } = req.body as { ids: string[] };
      if (!Array.isArray(ids)) return res.status(400).json({ message: "ids must be an array" });
      const result = await bulkDeleteDocuments(req.params.db, req.params.col, ids);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Indexes ───────────────────────────────────────────────────

  app.get("/api/mongo/databases/:db/collections/:col/indexes", requireAuth, async (req, res) => {
    try {
      res.json(await listIndexes(req.params.db, req.params.col));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/mongo/databases/:db/collections/:col/indexes", requireAdmin, async (req, res) => {
    try {
      const { keys, name, unique, sparse } = req.body;
      const result = await createIndex(req.params.db, req.params.col, keys, { name, unique, sparse });
      res.status(201).json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/mongo/databases/:db/collections/:col/indexes/:indexName", requireAdmin, async (req, res) => {
    try {
      await dropIndex(req.params.db, req.params.col, req.params.indexName);
      res.sendStatus(204);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Export ────────────────────────────────────────────────────

  app.get("/api/mongo/databases/:db/collections/:col/export", requireAuth, async (req, res) => {
    const { format = "json", filter = "{}" } = req.query as Record<string, string>;
    const { db, col } = req.params;
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
      const { documents, mode = "insert" } = req.body as {
        documents: unknown[];
        mode?: "insert" | "upsert";
      };
      if (!Array.isArray(documents))
        return res.status(400).json({ message: "documents must be an array" });
      const result = await importDocuments(req.params.db, req.params.col, documents, mode);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  return httpServer;
}
