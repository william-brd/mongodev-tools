import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { executeMongoScript } from "./lib/mongo";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth (Disabled)
  // await setupAuth(app);
  // registerAuthRoutes(app);

  // Scripts CRUD
  app.get(api.scripts.list.path, async (req, res) => {
    const scripts = await storage.getScripts();
    res.json(scripts);
  });

  app.get(api.scripts.get.path, async (req, res) => {
    const script = await storage.getScript(Number(req.params.id));
    if (!script) return res.status(404).json({ message: "Script not found" });
    res.json(script);
  });

  app.post(api.scripts.create.path, async (req, res) => {
    // if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = api.scripts.create.input.parse(req.body);
      const script = await storage.createScript(input);
      res.status(201).json(script);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      }
    }
  });

  app.put(api.scripts.update.path, async (req, res) => {
    // if (!req.isAuthenticated()) return res.sendStatus(401);
    const script = await storage.updateScript(Number(req.params.id), req.body);
    res.json(script);
  });

  app.delete(api.scripts.delete.path, async (req, res) => {
    // if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.deleteScript(Number(req.params.id));
    res.sendStatus(204);
  });

  // Execution
  app.post(api.scripts.execute.path, async (req, res) => {
    // if (!req.isAuthenticated()) return res.sendStatus(401);

    const start = Date.now();
    try {
      const { code, type } = req.body;
      const result = await executeMongoScript(code, type);
      const durationMs = Date.now() - start;

      // Log execution
      await storage.logExecution({
        scriptId: null, // Ad-hoc execution
        status: "success",
        result: result,
        durationMs,
      });

      res.json({ result, durationMs, status: "success" });
    } catch (error: any) {
      const durationMs = Date.now() - start;
      await storage.logExecution({
        scriptId: null,
        status: "error",
        result: { error: error.message },
        durationMs,
      });
      res.status(500).json({ message: error.message });
    }
  });

  app.get(api.executions.list.path, async (req, res) => {
    const limit = Number(req.query.limit ?? "10");
    const offset = Number(req.query.offset ?? "0");
    const safeLimit = Number.isNaN(limit)
      ? 10
      : Math.min(Math.max(limit, 1), 100);
    const safeOffset = Number.isNaN(offset) ? 0 : Math.max(offset, 0);
    const executions = await storage.getExecutions(safeLimit, safeOffset);
    res.json(executions);
  });

  return httpServer;
}
