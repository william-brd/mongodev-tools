import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupSession } from "./auth/keycloak";
import { getMongoClient } from "./lib/mongo";

// Falha rápida: SESSION_SECRET ausente permite forjar cookies de sessão
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
  console.error("[FATAL] SESSION_SECRET não definida em produção. Defina a variável antes de subir o serviço.");
  process.exit(1);
}

// Handlers globais para erros não capturados — garante log e exit limpo
process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException:", err.stack ?? err.message);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] unhandledRejection:", reason);
  process.exit(1);
});

const app = express();
const httpServer = createServer(app);

// Necessário para cookies e IP corretos por trás de nginx/proxy reverso
app.set("trust proxy", 1);

// Headers de segurança HTTP (X-Frame-Options, X-Content-Type-Options, etc.)
// CSP relaxado para permitir inline scripts/styles do React + Prismjs
app.use(
  helmet({
    contentSecurityPolicy: false, // SPA com Vite/inline styles não tolera CSP estrito sem configuração fina
    crossOriginEmbedderPolicy: false,
  })
);

setupSession(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Remove o prefixo de sub-caminho antes de chegar nas rotas.
// Ex: APP_BASE_PATH=/mongo-tools → /mongo-tools/api/... vira /api/...
const basePath = process.env.APP_BASE_PATH || "";
if (basePath) {
  app.use((req, _res, next) => {
    if (req.url === basePath || req.url.startsWith(basePath + "/")) {
      req.url = req.url.slice(basePath.length) || "/";
    }
    next();
  });
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const { storage } = await import("./storage");
  await (storage as any).init?.();

  // Health check — usado pelo Docker HEALTHCHECK e pelo load balancer
  app.get("/api/health", async (_req, res) => {
    const checks: Record<string, string> = {};
    let healthy = true;

    try {
      const mc = await getMongoClient();
      await mc.db("admin").command({ ping: 1 });
      checks.mongo = "ok";
    } catch (e: any) {
      checks.mongo = `error: ${e.message}`;
      healthy = false;
    }

    checks.storage = (storage as any)._ready ? "database" : "memory";

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("[error]", err.stack ?? err.message);
    if (!res.headersSent) res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
