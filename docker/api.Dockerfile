# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
RUN npm install --global pnpm@9.15.9
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @dineflow/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY docker/entrypoint.mjs docker/env.mjs docker/
# Generation does not connect to a database. No real credentials enter a layer.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm db:generate \
    && pnpm build:shared && pnpm --filter @dineflow/api build
RUN pnpm --filter @dineflow/api deploy --prod /runtime

FROM build AS migrate
USER node
CMD ["node", "docker/entrypoint.mjs", "migrate"]

FROM base AS runtime
WORKDIR /app
COPY --from=build --chown=node:node /runtime ./
COPY --chown=node:node docker/entrypoint.mjs docker/env.mjs ./docker/
USER node
EXPOSE 4000
CMD ["node", "docker/entrypoint.mjs", "api"]
