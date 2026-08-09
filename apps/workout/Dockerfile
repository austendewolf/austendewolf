# syntax=docker/dockerfile:1.7

# ----- deps ---------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable

# Workspace manifests (resolve graph without copying source).
# All four are required even though only workout is built here: with
# --frozen-lockfile pnpm validates the lockfile against every importer, and a
# missing manifest makes it refuse rather than skip.
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
COPY --from=deps /app/apps/workout/node_modules ./apps/workout/node_modules
# The packages' own node_modules carry pnpm's symlinks to their dependencies
# (drizzle-orm, postgres); without them the package sources resolve nothing.
COPY --from=deps /app/packages/auth/node_modules ./packages/auth/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/workout ./apps/workout
# Every workspace dependency of `workout`: node_modules holds only symlinks
# into these, so the sources have to travel too or the imports dangle. Adding a
# `workspace:*` dependency without adding it here fails the build, not the
# install, which is why it shows up as "Module not found" at `next build`.
COPY packages/auth ./packages/auth
COPY packages/db ./packages/db

ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* is inlined at build time, so Railway's runtime env is too late;
# these have to arrive as build args.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN pnpm --filter workout build

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
# Just the app. Schema migrations and the catalog seed are no longer part of a
# deploy: they live in packages/db and are run deliberately, the same way
# apps/web has always done it. That also retires a preDeployCommand whose seed
# re-ran on every single deploy and could overwrite hand-edited schedule rows.
COPY --from=builder --chown=nextjs:nodejs /app/apps/workout/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/workout/.next/static ./apps/workout/.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "apps/workout/server.js"]
