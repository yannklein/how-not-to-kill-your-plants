# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# `npm run build` = `next build --webpack` (Serwist needs webpack); it also
# writes public/sw.js and public/swe-worker-*.js. The app reads env lazily, so
# no secrets are needed at build time.
RUN npm run build
# One-shot tools, bundled so the runtime image needs neither tsx nor a .env.
RUN npx esbuild src/db/migrate.ts --bundle --platform=node --format=cjs --target=node24 --outfile=dist/migrate.js \
 && npx esbuild scripts/create-admin.ts --bundle --platform=node --format=cjs --target=node24 --outfile=dist/create-admin.js \
 && npx esbuild scripts/ai-smoke.ts --bundle --platform=node --format=cjs --target=node24 --outfile=dist/ai-smoke.js

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# curl is needed by the Coolify Scheduled Task (cron tick) run inside this container.
RUN apk add --no-cache curl
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
# Standalone output does not include public/ or .next/static: copy both.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# Migrations resolve "./drizzle" relative to the working directory (/app).
COPY --from=build --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=build --chown=nextjs:nodejs /app/dist ./dist
USER nextjs
EXPOSE 3000
CMD ["sh", "-c", "node dist/migrate.js && exec node server.js"]
