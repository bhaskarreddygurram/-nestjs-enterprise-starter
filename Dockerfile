# syntax=docker/dockerfile:1
# ----------------------------------------------------------------------------
# Multi-stage build for the NestJS app.
#   builder  → installs deps, generates the Prisma client, compiles to dist/
#   runner   → slim runtime image with the build output
# ----------------------------------------------------------------------------

# ---- Builder ---------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Toolchain for native modules (argon2). Only present in the builder stage.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ---- Runner ----------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Built artifacts + dependencies (kept un-pruned so `prisma migrate deploy`
# can run at container start; prune dev deps + add a migration job for prod).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

EXPOSE 8000
USER node

# Run pending migrations, then start. SIGTERM is handled by Nest shutdown hooks.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
