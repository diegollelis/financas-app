# API image for Render (ADRs 0009 and 0033). Build from the repository root, because the API needs
# packages/shared, which is consumed as TypeScript source (ADR 0015):
#   docker build -f apps/api/Dockerfile -t financas-api .

# Node >= 24 runs the shared .ts files directly (type stripping). Same major as .nvmrc.
FROM node:26-slim AS base
# Prisma's schema engine (migrations) needs OpenSSL, which the slim image lacks.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# Node 26 no longer ships corepack; same pnpm as "packageManager" in package.json.
RUN npm install -g pnpm@12.8.1
WORKDIR /app

# Manifests first: while they do not change, Docker reuses the installed dependencies.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The root "prepare" installs git hooks (lefthook): there is no git repository in the image.
RUN npm pkg delete scripts.prepare
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
# The install runs `prisma generate`, which reads the schema.
COPY apps/api/prisma apps/api/prisma

# Everything (dev dependencies included) to compile the API.
FROM manifests AS build
RUN pnpm install --frozen-lockfile --filter @financas/api...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @financas/api build

# Only what runs in production. prisma (the CLI) is a dependency because it migrates at startup.
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @financas/api...

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app ./
COPY packages/shared/src packages/shared/src
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
# Never run as root inside the container.
USER node
# Render's free plan has no pre-deploy command (ADR 0033): migrations run on every start, as the
# owner (MIGRATION_DATABASE_URL); then the API takes over the process, as the financas_app role
# (DATABASE_URL). `migrate deploy` only applies pending migrations, so a restart is cheap.
# --enable-source-maps: stack traces (logs and Sentry) point at the TypeScript lines; --import
# starts Sentry before the app loads (ADR 0034).
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node --enable-source-maps --import ./dist/instrument.js dist/main.js"]
