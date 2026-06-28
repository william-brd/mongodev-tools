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

# Copia apenas os artefatos prontos — sem rodar npm no runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 5000

CMD ["sh", "-c", "NODE_ENV=production node dist/index.cjs"]
