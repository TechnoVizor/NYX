# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Baked into the build: the /api rewrite target and the link back to the marketing site.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG API_URL=http://api:8000
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL API_URL=$API_URL
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S nyx && adduser -S nyx -G nyx
COPY --from=build --chown=nyx:nyx /app/.next/standalone ./
COPY --from=build --chown=nyx:nyx /app/.next/static ./.next/static
COPY --from=build --chown=nyx:nyx /app/public ./public
USER nyx
EXPOSE 3000
CMD ["node", "server.js"]
