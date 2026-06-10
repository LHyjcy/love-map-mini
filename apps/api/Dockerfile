# Multi-stage Dockerfile for the love-map-mini API.
#
# Env vars (DATABASE_URL, JWT_SECRET, WeChat/COS/map keys, etc.) are injected at
# RUNTIME via `docker run --env-file` / orchestrator secrets — never baked in.
# On each release, run `npx prisma migrate deploy` against the production DB
# before (or as part of) starting the container.

# ---- build stage ----
FROM node:20-slim AS build
WORKDIR /app

# Prisma needs OpenSSL to generate the client.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies (incl. devDeps for the TypeScript build).
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and generate the Prisma client + compile TypeScript.
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runtime stage ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Prisma engine runtime dependency.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy only what the running server needs.
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/server.js"]
