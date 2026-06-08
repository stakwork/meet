FROM node:20-alpine AS base

# 1. Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
    if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i; \
    else echo "Lockfile not found." && exit 1; \
    fi


# 1b. Production-only dependencies for the runtime image.
# The custom server (dist/server.js) is CommonJS and resolves its deps (ws,
# livekit-server-sdk, next, ...) from a full node_modules at runtime, so we ship a
# complete production install rather than Next's ESM-only standalone trace.
FROM base AS prod-deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
    if [ -f yarn.lock ]; then yarn --frozen-lockfile --production; \
    elif [ -f package-lock.json ]; then npm ci --omit=dev; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --prod; \
    else echo "Lockfile not found." && exit 1; \
    fi


# 2. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env for NEXT_PUBLIC_* vars only (these get inlined into the client bundle).
# Secrets (LIVEKIT_API_KEY, LIVEKIT_API_SECRET, S3_*, etc.) are provided at runtime
# via the orchestrator (see prod.yaml) — DO NOT bake them into the image.
ARG NEXT_PUBLIC_SHOW_SETTINGS_MENU=true
ARG NEXT_PUBLIC_LK_RECORD_ENDPOINT=/api/record
ARG NEXT_PUBLIC_CONN_DETAILS_ENDPOINT
ARG NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ARG NEXT_PUBLIC_DATADOG_SITE
ENV NEXT_PUBLIC_SHOW_SETTINGS_MENU=${NEXT_PUBLIC_SHOW_SETTINGS_MENU}
ENV NEXT_PUBLIC_LK_RECORD_ENDPOINT=${NEXT_PUBLIC_LK_RECORD_ENDPOINT}
ENV NEXT_PUBLIC_CONN_DETAILS_ENDPOINT=${NEXT_PUBLIC_CONN_DETAILS_ENDPOINT}
ENV NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=${NEXT_PUBLIC_DATADOG_CLIENT_TOKEN}
ENV NEXT_PUBLIC_DATADOG_SITE=${NEXT_PUBLIC_DATADOG_SITE}

RUN mkdir -p public/.well-known
COPY assetlinks.json public/.well-known/assetlinks.json
COPY apple-app-site-association public/.well-known/apple-app-site-association

# Build the Next app and compile the custom server (server.ts -> dist/server.js,
# lib/wsServer.ts -> dist/lib/wsServer.js).
RUN npm run build
RUN npx tsc --project tsconfig.server.json

# 3. Production image: full prod node_modules + Next build + custom server.
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Build cache is not needed at runtime.
RUN rm -rf .next/cache

# Place the compiled custom server at the app root: ./server.js and ./lib/wsServer.js
COPY --from=builder --chown=nextjs:nodejs /app/dist ./

USER nextjs

EXPOSE 3000

ENV PORT=3000

# server.ts binds 0.0.0.0 explicitly; PORT is read from env.
CMD ["node", "server.js"]
