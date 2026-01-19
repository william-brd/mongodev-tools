import { z } from "zod";
import {
  insertScriptSchema,
  scripts,
  executions,
  type ExecutionSummary,
} from "./schema";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  scripts: {
    list: {
      method: "GET" as const,
      path: "/api/scripts",
      responses: {
        // ✅ lista de scripts (antes estava ExecutionSummary)
        200: z.array(z.custom<typeof scripts.$inferSelect>()),
      },
    },

    // ✅ scripts.get deve ser /api/scripts/:id
    get: {
      method: "GET" as const,
      path: "/api/scripts/:id",
      responses: {
        200: z.custom<typeof scripts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },

    create: {
      method: "POST" as const,
      path: "/api/scripts",
      input: insertScriptSchema,
      responses: {
        201: z.custom<typeof scripts.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/scripts/:id",
      input: insertScriptSchema.partial(),
      responses: {
        200: z.custom<typeof scripts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/scripts/:id",
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    execute: {
      method: "POST" as const,
      path: "/api/execute",
      input: z.object({
        code: z.string(),
        type: z.enum(["query", "aggregation"]),
      }),
      responses: {
        200: z.object({
          result: z.any(),
          durationMs: z.number(),
          status: z.string(),
        }),
        400: errorSchemas.validation,
      },
    },
  },

  executions: {
    list: {
      method: "GET" as const,
      path: "/api/executions",
      responses: {
        // ✅ se list é summary, use ExecutionSummary (combina com seu server)
        200: z.array(z.custom<ExecutionSummary>()),
        // se você preferir retornar execution completa, troque pelo $inferSelect
      },
    },

    // ✅ AQUI está o que faltava: executions.get
    get: {
      method: "GET" as const,
      path: "/api/executions/:id",
      responses: {
        200: z.custom<typeof executions.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
} as const;

export function buildUrl(
  path: string,
  params?: Record<string, string | number>
): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
