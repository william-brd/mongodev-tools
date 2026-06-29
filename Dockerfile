# ─── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# Instala todas as deps (dev + prod) para o build
RUN npm ci --legacy-peer-deps

COPY . .
# APP_BASE_PATH define o sub-caminho onde a app é servida (ex: /mongo-tools)
ARG APP_BASE_PATH=/mongo-tools
RUN APP_BASE_PATH=$APP_BASE_PATH npm run build

# Reinstala somente as deps de produção no mesmo stage
# (evita npm prune/ci no runtime que sofre com peer conflicts)
RUN npm ci --omit=dev --legacy-peer-deps

# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

# curl necessário para o HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copia apenas os artefatos prontos — sem rodar npm no runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 5000

# Docker Swarm usa este healthcheck para decidir se o container está pronto.
# --start-period=20s dá tempo para o TypeORM conectar e sincronizar antes do primeiro check.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -sf http://localhost:5000/api/health || exit 1

CMD ["sh", "-c", "NODE_ENV=production node dist/index.cjs"]
