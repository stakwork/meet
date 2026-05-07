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

RUN npm run build

# 3. Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static


USER nextjs

EXPOSE 3000

ENV PORT=3000

CMD HOSTNAME=0.0.0.0 node server.js
