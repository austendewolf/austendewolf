# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* values are inlined by Next.js at build time, so they
# must be present here — Railway env vars don't reach the docker build
# unless we declare them as ARGs.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build

# Pre-extract the seed catalog as JSON so the runner image doesn't need
# the TypeScript source. The seed script reads these at deploy time.
RUN node --experimental-strip-types -e \
  "import('./app/program.ts').then(m=>require('node:fs').writeFileSync('scripts/seed.program.json', JSON.stringify(m.PROGRAM)))" \
 && node --experimental-strip-types -e \
  "import('./app/week-schedule.ts').then(m=>require('node:fs').writeFileSync('scripts/seed.schedule.json', JSON.stringify(m.SCHEDULE)))"

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migration runner — invoked as railway preDeployCommand.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations
RUN npm install --no-save --omit=dev postgres@^3 \
  && chown -R nextjs:nodejs /app/node_modules

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
