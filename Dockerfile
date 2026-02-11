# syntax=docker/dockerfile:1.7
## Set global build ENV
ARG NODEJS_VERSION

## Base image for all building stages
FROM node:${NODEJS_VERSION}-slim AS base

ARG USE_CN_MIRROR

ENV DEBIAN_FRONTEND="noninteractive"

RUN set -e && \
    if [ "${USE_CN_MIRROR}" = "true" ]; then \
        sed -i "s/deb.debian.org/mirrors.ustc.edu.cn/g" "/etc/apt/sources.list.d/debian.sources"; \
    fi && \
    apt update && \
    apt install ca-certificates proxychains-ng -qy && \
    mkdir -p /distroless/bin /distroless/etc /distroless/etc/ssl/certs /distroless/lib && \
    cp /usr/lib/$(arch)-linux-gnu/libproxychains.so.4 /distroless/lib/libproxychains.so.4 && \
    cp /usr/lib/$(arch)-linux-gnu/libdl.so.2 /distroless/lib/libdl.so.2 && \
    cp /usr/bin/proxychains4 /distroless/bin/proxychains && \
    cp /etc/proxychains4.conf /distroless/etc/proxychains4.conf && \
    cp /usr/lib/$(arch)-linux-gnu/libstdc++.so.6 /distroless/lib/libstdc++.so.6 && \
    cp /usr/lib/$(arch)-linux-gnu/libgcc_s.so.1 /distroless/lib/libgcc_s.so.1 && \
    cp /usr/local/bin/node /distroless/bin/node && \
    cp /etc/ssl/certs/ca-certificates.crt /distroless/etc/ssl/certs/ca-certificates.crt && \
    rm -rf /tmp/* /var/lib/apt/lists/* /var/tmp/*

## Builder image, install all the dependencies and build the app
FROM base AS builder

ARG USE_CN_MIRROR
ARG NEXT_PUBLIC_BASE_PATH
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_ANALYTICS_POSTHOG
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_ANALYTICS_UMAMI
ARG NEXT_PUBLIC_UMAMI_SCRIPT_URL
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG FEATURE_FLAGS
ARG APP_URL
ARG DATABASE_DRIVER
ARG DATABASE_URL
ARG KEY_VAULTS_SECRET
ARG AUTH_SECRET
ARG SKIP_DOCKER_LINT_AND_TYPECHECK
ARG PG_VERSION="8.17.2"
ARG DRIZZLE_ORM_VERSION="0.44.7"

ENV NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH}" \
    FEATURE_FLAGS="${FEATURE_FLAGS}"

ENV APP_URL="${APP_URL}" \
    DATABASE_DRIVER="${DATABASE_DRIVER}" \
    DATABASE_URL="${DATABASE_URL}" \
    KEY_VAULTS_SECRET="${KEY_VAULTS_SECRET}" \
    AUTH_SECRET="${AUTH_SECRET}"

# Sentry
ENV NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN}"

# Posthog
ENV NEXT_PUBLIC_ANALYTICS_POSTHOG="${NEXT_PUBLIC_ANALYTICS_POSTHOG}" \
    NEXT_PUBLIC_POSTHOG_HOST="${NEXT_PUBLIC_POSTHOG_HOST}" \
    NEXT_PUBLIC_POSTHOG_KEY="${NEXT_PUBLIC_POSTHOG_KEY}"

# Umami
ENV NEXT_PUBLIC_ANALYTICS_UMAMI="${NEXT_PUBLIC_ANALYTICS_UMAMI}" \
    NEXT_PUBLIC_UMAMI_SCRIPT_URL="${NEXT_PUBLIC_UMAMI_SCRIPT_URL}" \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID="${NEXT_PUBLIC_UMAMI_WEBSITE_ID}"

# Node
ENV NODE_OPTIONS="--max-old-space-size=6144"
ENV PNPM_STORE_DIR="/root/.local/share/pnpm/store"

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY .npmrc ./
COPY packages ./packages
COPY patches ./patches
# bring in desktop workspace manifest so pnpm can resolve it
COPY apps/desktop/src/main/package.json ./apps/desktop/src/main/package.json

RUN --mount=type=cache,id=lobechat-npm-cache,target=/root/.npm,sharing=locked \
    --mount=type=cache,id=lobechat-pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    set -e && \
    if [ "${USE_CN_MIRROR}" = "true" ]; then \
        export SENTRYCLI_CDNURL="https://npmmirror.com/mirrors/sentry-cli"; \
        # 1) 写全局 npmrc，保证任何目录都生效（包括 /deps）
        printf "registry=https://registry.npmmirror.com/\n" >> /root/.npmrc; \
        printf "canvas_binary_host_mirror=https://npmmirror.com/mirrors/canvas\n" >> /root/.npmrc; \
        npm config set registry "https://registry.npmmirror.com/"; \
    fi && \
    export COREPACK_NPM_REGISTRY="$(npm config get registry | sed 's/\/$//')" && \
    npm i -g corepack@latest && \
    corepack enable && \
    corepack prepare "$(sed -n 's/.*\"packageManager\": \"\(.*\)\".*/\1/p' package.json)" --activate && \
    # 2) pnpm 显式指定 registry（避免 pnpm 读配置不一致）
    pnpm config set store-dir "${PNPM_STORE_DIR}" && \
    pnpm config set registry "$(npm config get registry)"

RUN --mount=type=cache,id=lobechat-npm-cache,target=/root/.npm,sharing=locked \
    --mount=type=cache,id=lobechat-pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    set -e && \
    mkdir -p /deps && \
    cd /deps && \
    npm init -y && \
    pnpm config set store-dir "${PNPM_STORE_DIR}" && \
    pnpm config set registry "$(npm config get registry)" && \
    pnpm add "pg@${PG_VERSION}" "drizzle-orm@${DRIZZLE_ORM_VERSION}" --prefer-offline

COPY next.config.ts ./
COPY next-env.d.ts ./
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY vitest.config.mts ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY locales ./locales
COPY apps ./apps

# run build standalone for docker version
RUN --mount=type=cache,id=lobechat-next-cache,target=/app/.next/cache,sharing=locked \
    --mount=type=cache,id=lobechat-npm-cache,target=/root/.npm,sharing=locked \
    --mount=type=cache,id=lobechat-pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    --mount=type=cache,id=lobechat-node-modules,target=/app/node_modules,sharing=locked \
    set -e && \
    pnpm fetch --frozen-lockfile --prefer-offline && \
    CI=true pnpm install --frozen-lockfile --offline --prefer-offline && \
    if [ "${SKIP_DOCKER_LINT_AND_TYPECHECK}" = "true" ]; then \
        pnpm exec tsx scripts/prebuild.mts && \
        NEXT_DISABLE_ESLINT=1 NEXT_TELEMETRY_DISABLED=1 DISABLE_WEBPACK_BUILD_WORKER=1 NODE_OPTIONS=--max-old-space-size=6144 DOCKER=true pnpm exec next build --webpack && \
        pnpm run build-sitemap; \
    else \
        NEXT_TELEMETRY_DISABLED=1 pnpm run build:docker; \
    fi

# Prepare desktop export assets for Electron packaging (if generated)
RUN set -e && \
    if [ -d "/app/out" ]; then \
        mkdir -p /app/apps/desktop/dist/next && \
        cp -a /app/out/. /app/apps/desktop/dist/next/ && \
        echo "Copied Next export output into /app/apps/desktop/dist/next"; \
    else \
        echo "No Next export output found at /app/out, creating empty directory" && \
        mkdir -p /app/apps/desktop/dist/next; \
    fi

## Application image, copy all the files for production
FROM busybox:latest AS app

COPY --from=base /distroless/ /

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/.next/standalone /app/
# Copy Next export output for desktop renderer
COPY --from=builder /app/apps/desktop/dist/next /app/apps/desktop/dist/next

# Copy database migrations
COPY --from=builder /app/packages/database/migrations /app/migrations
COPY --from=builder /app/scripts/migrateServerDB/docker.cjs /app/docker.cjs
COPY --from=builder /app/scripts/migrateServerDB/errorHint.js /app/errorHint.js

# copy dependencies
COPY --from=builder /deps/node_modules/.pnpm /app/node_modules/.pnpm
COPY --from=builder /deps/node_modules/pg /app/node_modules/pg
COPY --from=builder /deps/node_modules/drizzle-orm /app/node_modules/drizzle-orm

# Copy server launcher and shared scripts
COPY --from=builder /app/scripts/serverLauncher/startServer.js /app/startServer.js
COPY --from=builder /app/scripts/_shared /app/scripts/_shared

RUN set -e && \
    addgroup -S -g 1001 nodejs && \
    adduser -D -G nodejs -H -S -h /app -u 1001 nextjs && \
    chown -R nextjs:nodejs /app /etc/proxychains4.conf

## Production image, copy all the files and run next
FROM scratch

# Copy all the files from app, set the correct permission for prerender cache
COPY --from=app / /

ENV NODE_ENV="production" \
    NODE_OPTIONS="--dns-result-order=ipv4first --use-openssl-ca" \
    SSL_CERT_FILE="/etc/ssl/certs/ca-certificates.crt"

# Make the middleware rewrite through local as default
# refs: https://github.com/lobehub/lobe-chat/issues/5876
ENV MIDDLEWARE_REWRITE_THROUGH_LOCAL="1"

# set hostname to localhost
ENV HOSTNAME="0.0.0.0" \
    PORT="3210"

USER nextjs

EXPOSE 3210/tcp

ENTRYPOINT ["/bin/node"]

CMD ["/app/startServer.js"]
