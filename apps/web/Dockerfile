# syntax=docker/dockerfile:1.7

# ----- deps ---------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable

# Workspace manifests (resolve graph without copying source).
# Every workspace project's manifest has to be here, including ones this image
# does not build: --frozen-lockfile compares the lockfile against the whole
# workspace, and a missing importer makes it refuse to install.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/workout/package.json ./apps/workout/
COPY packages/auth/package.json ./packages/auth/
COPY packages/db/package.json ./packages/db/

RUN pnpm install --frozen-lockfile

# ----- builder ------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/auth/node_modules ./packages/auth/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/web ./apps/web
# Workspace dependencies: node_modules carries only symlinks into these, so the
# sources have to be present or the imports dangle at build time.
COPY packages/auth ./packages/auth
COPY packages/db ./packages/db

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

RUN pnpm --filter web build

# ----- runner -------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone bundle preserves the workspace structure when outputFileTracingRoot is set.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/content ./apps/web/content

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
