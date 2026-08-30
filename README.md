# hub-store Monorepo

pnpm workspaces + Turborepo. FE microfrontends (`apps/*`), shared FE packages (`packages/*`), polyglot backend services (`services/*`).

## Dev port map

| Service              | Port  |
| -------------------- | ----- |
| BFF gateway (HTTP)   | 8080  |
| shell (MF host)      | 3000  |
| orders (MF remote)   | 3001  |
| fulfillment (MF remote) | 3002 |
| fulfillment gRPC     | 50051 |
| batching gRPC        | 50052 |
| print gRPC           | 50053 |

## Commands

```bash
pnpm install        # install all workspaces
pnpm build          # turbo run build (apps: vite build, packages: tsc --noEmit)
pnpm test           # turbo run test
pnpm dev            # turbo run dev (all apps dev servers)
```

`.env` at root holds the dev-only `JWT_DEV_SECRET` and the port map above (committed intentionally — dev secret only, never a production secret).
