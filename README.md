# Hub Store — Fulfillment Operations Platform

A polyglot monorepo for a hub-store logistics operation: order intake and
coordination, warehouse picking batches, last-mile delivery and technician
dispatch, D2C/dropship hand-off to carriers, COD settlement, label/receipt
printing, and a mobile PWA for field staff.

The system is exercised at **production-like scale** — the dev seed simulates a
full year of operations (~2.5M orders, ~480k picking batches) — see
[Data seeding](#data-seeding).

## Architecture

```
                        ┌────────────────────────────────────────────┐
 Browser / PWA          │              Frontend (React 18)           │
 ─────────────────►     │  shell :3000 (MF host, OIDC login, layout) │
                        │  ├─ orders      :3001 (MF remote)          │
                        │  ├─ fulfillment :3002 (MF remote)          │
                        │  └─ ktv-mobile  :3010 (field-staff PWA)    │
                        └────────────────────┬───────────────────────┘
                                             │ REST (JWT bearer)
                        ┌────────────────────▼───────────────────────┐
                        │       BFF gateway — Fastify :8080          │
                        │  authz (role gates) · audit · aggregation  │
                        └───┬──────────────┬──────────────┬──────────┘
                            │ gRPC         │ gRPC         │ gRPC
              ┌─────────────▼───┐   ┌──────▼──────┐  ┌────▼─────────┐
              │ fulfillment-svc │   │ batching-svc│  │ print-service│
              │ Java 17/Spring  │   │ Go          │  │ Python       │
              │ :50051          │   │ :50052      │  │ :50053       │
              └───┬─────────────┘   └──────┬──────┘  └──────────────┘
                  │                        │
        ┌─────────▼────────────────────────▼─────────┐
        │        PostgreSQL 16 — two databases       │
        │  fulfillment (orders, COD, audit, tech…)   │
        │  batching (batches, batch_items, planning) │
        └────────────────────────────────────────────┘
                  │
        ┌─────────▼──────────┐   ┌──────────────────────────┐
        │ Keycloak 26 :8081  │   │ Kafka 3.9 :9092 (opt-in  │
        │ realm `hubstore`   │   │ side-channel, default off│
        │ OIDC/PKCE login    │   │ + kafka-ui :8085)        │
        └────────────────────┘   └──────────────────────────┘
```

- **Frontend** — Module Federation: `shell` is the host (auth, layout, routing,
  notifications); `orders` and `fulfillment` are remotes; `ktv-mobile` is the
  field-staff PWA. Shared code lives in `packages/shared` (design tokens,
  permissions matrix, contracts) and `packages/api-client` (RTK Query
  singleton + axios instance).
- **BFF gateway** — the only REST surface the browser talks to. Owns JWT
  verification (JWKS from Keycloak), per-route role gates, error envelopes,
  audit-trail writing, and cross-service aggregation (dashboard, settlement).
- **fulfillment-service** (Java 17, Spring Boot + gRPC) — orders, intake,
  coordination status, COD confirmations, tech/installation dispatch, master
  data, print errors, webhook intake. Owns the `fulfillment` database.
- **batching-service** (Go + gRPC) — picking-batch lifecycle (create → pick →
  complete), batch items, distance-based packing suggestions, carrier quotes
  and bookings (mock/real Ahamove adapter), shipment planning. Owns the
  `batching` database.
- **print-service** (Python + gRPC) — receipt/label rendering and printer
  integrations.
- **Protobuf contracts** live centrally in [`api/proto`](api/proto) with
  generated stubs for Java, Go and TypeScript under `api/proto/gen`.

## Repository layout

```
apps/
  shell/            MF host — layout, auth, routing, notifications (:3000)
  orders/           orders remote — order list, D2C, dashboard, area staff (:3001)
  fulfillment/      fulfillment remote — batches, print, delivery (:3002)
  ktv-mobile/       field-staff PWA (:3010)
services/
  bff-gateway/      Fastify BFF (:8080)
  fulfillment-service/  Java 17 · Spring Boot · gRPC (:50051)
  batching-service/     Go · gRPC (:50052)
  print-service/        Python · gRPC (:50053)
packages/
  api-client/       RTK Query api singleton + typed axios base query
  shared/           design tokens, permission matrix, shared DTO contracts
api/proto/          central protobuf contracts + generated stubs
e2e/                Playwright suites (main flows + regression 10xx–15xx)
docker/             keycloak realm JSON, kafka, postgres, nginx configs
scripts/            boot-all, seed-db, reset-db, seed-history, k8s helpers
k8s/                kustomize base + overlays
docs/               plans, specs, QA rubric, improvement log
```

## Tech stack

| Layer    | Tech                                                            |
| -------- | --------------------------------------------------------------- |
| Frontend | React 18, Vite 5, Module Federation, Ant Design 4, RTK Query 2, i18next |
| BFF      | Node 20+, TypeScript, Fastify, tsx, `pg`, `@grpc/grpc-js`, jose  |
| Java svc | Java 17, Spring Boot, gRPC, Flyway, jOOQ-free JDBC              |
| Go svc   | Go, gRPC, golang-migrate                                        |
| Python   | grpcio 1.83 (pinned), reportlab                                 |
| Infra    | PostgreSQL 16, Keycloak 26, Kafka 3.9 (KRaft), Docker Compose, kustomize |
| Tooling  | pnpm 10 workspaces + Turborepo, Vitest, Playwright              |

## Quick start

Prerequisites: **Node ≥ 20**, **pnpm 10**, **Docker** (for Postgres/Keycloak/
Kafka), and toolchains for the services you want to run (JDK 17 + Maven, Go,
Python 3).

1. **Configure environment** — copy the template and fill local secrets:

   ```bash
   cp .env.example .env
   # Required: POSTGRES_PASSWORD, JWT_DEV_SECRET, VITE_JWT_DEV_SECRET,
   # INTERNAL_SERVICE_TOKEN. See inline comments in .env.example.
   ```

   > `.env` is git-ignored and must never be committed.

2. **Boot the whole stack** (postgres + keycloak + 3 gRPC services + BFF +
   3 FE dev servers):

   ```bash
   bash scripts/boot-all.sh           # boot and block
   BOOT_ONLY=1 bash scripts/boot-all.sh  # boot and exit, processes keep running
   E2E=1 bash scripts/boot-all.sh        # reset DBs + keycloak volume first
   ```

   The script waits for Postgres, Keycloak realm import, and all 7 service
   ports before reporting ready.

3. **Open the app** — <http://localhost:3000>, sign in via Keycloak (PKCE).

   Seeded dev users (realm `hubstore`, same password unless rotated):
   `admin`, `manager`, `coordinator`, `warehouse`, `warehouse-emp`, `ktv-001`.
   Direct access grants are disabled by design — login goes through the
   browser PKCE flow.

4. **Seed demo data** — see below.

## Data seeding

Two complementary tools:

| Script                  | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `scripts/seed-db.sh`    | Canonical baseline seed (idempotent, emptiness-gated): shops, regions, staff, printers, a handful of orders/batches from `api/seed/*.json`. |
| `scripts/reset-db.sh`   | Wipe both databases + Keycloak volume, then re-seed.           |
| `scripts/seed-history.mjs` | **Production-scale simulation**: streams ~1 year of operations (≈2.5M orders) as COPY-format files and bulk-loads them via `COPY FROM STDIN`. |

Year-scale simulation:

```bash
node scripts/seed-history.mjs             # ~2.5M orders (default)
SCALE=0.2 node scripts/seed-history.mjs   # ~500k orders
```

Deterministic (fixed PRNG seed), ongoing codes continue from the current
database maxima with a +100k safety buffer so it never collides with codes the
running app mints mid-seed. Distributions model realistic operations: monthly
growth, weekday/weekend cycles, a Tet-holiday dip, ~5% failed deliveries with
reasons, COD reconciliation at ~99.9% collected, picking batches capped at
5 orders each, hiring of service staff across the year, plus transfers, print
errors, webhook events and regional service-employee assignments. After
loading it refreshes sequences and creates indexes used by list filters and
the dashboard.

## Ports (dev)

| Service                | Port |
| ---------------------- | ---- |
| shell (MF host)        | 3000 |
| orders remote          | 3001 |
| fulfillment remote     | 3002 |
| ktv-mobile PWA         | 3010 |
| BFF gateway            | 8080 |
| Keycloak               | 8081 |
| batching health (HTTP) | 8082 |
| kafka-ui               | 8085 |
| fulfillment gRPC       | 50051 |
| batching gRPC          | 50052 |
| print gRPC             | 50053 |
| Postgres               | 5432 |
| Kafka                  | 9092 |

## Testing

```bash
pnpm test                 # everything wired into Turborepo (TS workspaces)
cd services/fulfillment-service && ./run.sh test   # mvn test
cd services/batching-service    && go test ./...
cd e2e && npx playwright test                      # full e2e (boot-all first)
```

- BFF contract tests spin up **real gRPC mock servers** from the protobuf
  definitions and inject the Fastify app — no hand-rolled HTTP stubs.
- The e2e suites cover the main flows plus regression specs (`10xx` role
  matrix, `1100` order validation, `1200` fulfillment ops, `13xx` batching &
  realtime, `1401` KTV mobile, `15xx` SF-7 sweep) with per-suite config files.

## Roles and permissions

Roles live in Keycloak (`realm_access.roles`) and are mapped to permissions by
a single matrix shared by frontend and backend:

| Role             | Highlights                                              |
| ---------------- | ------------------------------------------------------- |
| Admin            | everything except audit; printer & area-staff management |
| Manager          | orders, users, audit, settlement — no printer admin     |
| Coordinator      | order coordination, COD confirmation                    |
| WarehouseOps     | warehouse picking operations                            |
| WarehouseEmployee| D2C only                                                |
| KTV / CTV        | technician & contractor mobile flows                    |

When changing a permission, update **both** the FE matrix
(`packages/shared/src/hooks/usePermissions.tsx`) and the BFF route guard in
the same change — the regression suite (`e2e/tests/1000-*`) asserts nav
visibility per role, and API-level gates must stay in sync with it.

## Kubernetes

Helper scripts for building images, preflight checks and deploying via
kustomize overlays:

```bash
bash scripts/k8s-preflight.sh
bash scripts/k8s-build-images.sh
bash scripts/k8s-deploy.sh
```

## Conventions

- **Contracts first** — protobuf definitions in `api/proto` are the single
  source of truth; generated stubs are committed. REST DTOs are camelCase and
  never leak proto field names.
- **Error envelope** — every non-2xx response is
  `{ statusCode, message, code, details? }` with stable machine codes
  (`PERMISSION_DENIED`, `UPSTREAM_UNAVAILABLE`, `VALIDATION_ERROR`, …).
- **Audit trail** — every mutation goes through the BFF, which writes
  `activity_log` directly to the fulfillment database (fail-open).
- **Secrets** — local-only in `.env`; never commit. Rotated dev literals live
  in the Keycloak realm JSON (dev-only).
