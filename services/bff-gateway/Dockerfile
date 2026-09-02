# bff-gateway (Node/Fastify :8080) — SF-11 compose mẫu.
# Build context = REPO ROOT (bff import @hub-store/shared workspace:*).
FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY services/bff-gateway/package.json services/bff-gateway/
RUN pnpm install --frozen-lockfile --filter @hub-store/bff-gateway
# BFF import TS gencode qua tsconfig paths → giữ nguyên layout repo
COPY api/proto/gen/ts api/proto/gen/ts
COPY services/bff-gateway services/bff-gateway
WORKDIR /repo/services/bff-gateway
EXPOSE 8080
CMD ["pnpm", "start"]
