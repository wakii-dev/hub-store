<div align="center">

# 📦 Hub Store

**Fulfillment operations platform** — order intake & coordination, warehouse
picking batches, last-mile delivery, technician dispatch, D2C/dropship
hand-off to carriers, COD settlement, label/receipt printing, and a mobile
PWA for field staff.

[![CI](https://github.com/wakii-dev/hub-store/actions/workflows/ci.yml/badge.svg)](https://github.com/wakii-dev/hub-store/actions/workflows/ci.yml)
![release](https://img.shields.io/badge/release-v0.1.1-8b5cf6)
![seed](https://img.shields.io/badge/dev_seed-≈2.5M_orders-10b981)
![e2e](https://img.shields.io/badge/e2e-Playwright-2e9e5b)

`React 18` · `Module Federation` · `TypeScript` · `Fastify` · `Java 17 · Spring Boot 3` · `Go` · `Python` · `gRPC` · `PostgreSQL 16` · `Keycloak 26` · `Kafka 3.9` · `Turborepo` · `Playwright`

</div>

---

pnpm workspaces + Turborepo monorepo. Frontend microfrontends (`apps/*`),
shared FE packages (`packages/*`), and polyglot backend services
(`services/*`). Services talk **gRPC** to each other; the browser only talks
**REST** to the BFF gateway.

| ✨ | Highlight |
| -- | --------- |
| 🔀 | **Module Federation** — shell host + 3 remotes, federation rebuilt from source on every image build |
| 🌐 | **Polyglot gRPC backbone** — Java owns orders, Go owns batches, Python prints — contract-first via central protobuf |
| 🏭 | **Production-like dev data** — deterministic seed simulating a full year: ≈2.5M orders, ≈480k picking batches |
| ✅ | **Full CI matrix** — typecheck + unit (Node/Go/Java) + 5 Docker builds + real-infra Playwright e2e on every push |

## 🏗️ Architecture

<p align="center">
  <img src="docs/architecture.svg" alt="Hub Store architecture" width="900">
</p>

<details>
<summary>ASCII version (terminal-friendly)</summary>

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
                            │ gRPC :50051  │ gRPC :50052  │ gRPC :50053
              ┌─────────────▼───┐   ┌──────▼──────┐  ┌────▼─────────┐
              │ fulfillment-svc │   │ batching-svc│  │ print-service│
              │ Java 17/Spring  │   │ Go          │  │ Python       │
              │ owns orders     │   │ owns batches│  │ PDF print    │
              └───┬─────────────┘   └──────┬──────┘  └──────────────┘
                  │        PostgreSQL 16 — two databases         │
                  │  fulfillment (orders, COD, audit, tech…)     │
                  │  batching (batches, batch_items, planning)   │
                  └──────────────────────────────────────────────┘
        Keycloak 26 :8081 (realm `hubstore`, OIDC/PKCE)
        Kafka 3.9 :9092 (opt-in side-channel, default off) + kafka-ui :8085
```

</details>

Cross-service mutation chain: `CreateBatch` → Go calls Java
`MutateOrderStatus` (batchStatus 0→1); `CancelBatch` → reverts to 0;
`CompletePicking` → 2.

The system is exercised at **production-like scale** — the dev seed simulates
a full year of operations (~2.5M orders, ~480k picking batches). See
[Data seeding](#-data-seeding).

## 📁 Repository layout

<p align="center">
  <img src="docs/repo-map.svg" alt="Hub Store repository layout" width="900">
</p>

<details>
<summary>Plain-text tree</summary>

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
  print-service/        Python · grpcio (:50053)
packages/
  api-client/       RTK Query api singleton + typed axios base query
  shared/           design tokens, permission matrix, shared DTO contracts
api/proto/          central protobuf contracts + generated stubs (java/go/ts)
e2e/                Playwright suites (main flows + regression 10xx–15xx)
docker/             keycloak realm JSON, kafka, postgres, nginx configs
scripts/            boot-all, seed-db, reset-db, seed-history, backup-db, k8s helpers
k8s/                kustomize base + overlays
docs/               plans, specs, QA rubric, improvement log
```

</details>

## 🧰 Tech stack

| Layer    | Tech                                                            |
| -------- | --------------------------------------------------------------- |
| Frontend | React 18, Vite 5, Module Federation, Ant Design 4, RTK Query 2, i18next |
| BFF      | Node 20+, TypeScript, Fastify, tsx, `pg`, `@grpc/grpc-js`, jose  |
| Java svc | Java 17, Spring Boot 3, gRPC, Flyway                            |
| Go svc   | Go, gRPC, golang-migrate                                        |
| Python   | grpcio 1.83 (pinned), reportlab                                 |
| Infra    | PostgreSQL 16, Keycloak 26, Kafka 3.9 (KRaft), Docker Compose, kustomize |
| Tooling  | pnpm 10 workspaces + Turborepo, Vitest, Playwright              |

## 🔌 Dev port map

| Service                 | Port  |
| ----------------------- | ----- |
| shell (MF host)         | 3000  |
| orders (MF remote)      | 3001  |
| fulfillment (MF remote) | 3002  |
| ktv-mobile PWA          | 3010  |
| BFF gateway (HTTP)      | 8080  |
| Keycloak                | 8081  |
| batching health (HTTP)  | 8082  |
| kafka-ui                | 8085  |
| fulfillment gRPC        | 50051 |
| batching gRPC           | 50052 |
| print gRPC              | 50053 |
| Postgres                | 5432  |
| Kafka                   | 9092  |

## 🚀 Running the whole system

### Option 1 — dev (one command, all 7 processes)

```bash
bash scripts/boot-all.sh              # boots postgres → keycloak → java → go →
                                      # python → bff → 2 remotes → shell (Ctrl-C stops all)
BOOT_ONLY=1 bash scripts/boot-all.sh  # boot and exit — processes keep running
```

Then open <http://localhost:3000>.

> [!NOTE]
> `pnpm dev` alone only starts the 3 FE apps — the polyglot services must go
> through their own `run.sh` or `boot-all.sh`.

### Option 2 — docker compose (no java/go/python needed)

```bash
docker compose up --build
# open http://localhost:3000
```

> [!NOTE]
> Compose is the **local-run configuration** (not a production deployment):
> postgres (2 DBs: `fulfillment` + `batching`) → one-shot migrations (Flyway
> `orders-migrate`, golang-migrate `batches-migrate`) → `db-seed` → app
> services + keycloak + nginx serving shell/remotes static builds and proxying
> `/api` to the BFF.

**From a clean machine:** only Docker + a `.env` file are needed —
`docker compose up --build` runs the whole migrate + seed + boot chain. Data
persists through the `pgdata` volume; `docker compose restart` keeps created
records, while `docker compose down -v` resets to the seed state.

### Individual services

Each service has its own `run.sh`:

```bash
(cd services/fulfillment-service && ./run.sh)   # Java gRPC :50051 (also: ./run.sh smoke | test)
(cd services/batching-service    && ./run.sh)   # Go gRPC :50052
(cd services/print-service       && ./run.sh)   # Python gRPC :50053
(cd services/bff-gateway         && pnpm dev)   # REST :8080
```

## 🌱 Fresh-clone setup

> [!IMPORTANT]
> The repo does **not** track `.env` (git-ignored — local secrets only).
> Before the first run:

```bash
cp .env.example .env
# open .env and fill in the required variables below (local dev values — never commit)
```

| Required                       | Meaning                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`            | compose fails loudly without it (`:?` pattern in every DB consumer)  |
| `INTERNAL_SERVICE_TOKEN`       | s2s Go→Java + reconciler + webhook machine calls                     |
| `JWT_DEV_SECRET` / `VITE_JWT_DEV_SECRET` | dev JWT secret BFF/FE — must be the same value            |

Everything else has sensible defaults (see `.env.example`).

## 🗃️ Data seeding

Three complementary tools:

| Script                   | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `scripts/seed-db.sh`     | Canonical baseline seed (idempotent, emptiness-gated): shops, regions, staff, printers, a handful of orders/batches from `api/seed/*.json`. |
| `scripts/reset-db.sh`    | Truncate both databases + remove the keycloak volume, then re-seed. |
| `scripts/seed-history.mjs` | **Production-scale simulation**: streams ~1 year of operations (≈2.5M orders) as COPY-format files and bulk-loads them via `COPY FROM STDIN`. |

Year-scale simulation:

```bash
node scripts/seed-history.mjs             # ~2.5M orders (default)
SCALE=0.2 node scripts/seed-history.mjs   # ~500k orders
```

Deterministic (fixed PRNG seed); ongoing codes continue from current database
maxima with a +100k safety buffer, and the batching code sequence is parked at
1,000,000 so it never collides with codes the running app mints mid-seed.
Distributions model realistic operations: monthly growth, weekday/weekend
cycles, a Tet-holiday dip, ~5% failed deliveries with reasons, COD
reconciliation at ~99.9% collected, picking batches capped at 5 orders each,
hiring of regional service staff across the year, plus transfer tickets,
print errors, webhook events and shipment bookings. After loading it refreshes
sequences and creates indexes used by list filters and the dashboard.

- **Emptiness gate**: the canonical seed skips any database that already has
  data (no upserts). If `api/seed/canonical-seed.json` changes, reset manually
  with `reset-db.sh`.
- Tables and the `batches_code_seq` sequence are created by migrations
  (Flyway for `fulfillment`, golang-migrate for `batching`); the column
  contract is documented in the `scripts/seed-db.sh` header.

## ⌨️ Commands

```bash
pnpm install        # install all workspaces
pnpm build          # turbo run build (apps: vite build, packages: tsc --noEmit)
pnpm build --force  # disable turbo cache — use when federation remoteEntry looks stale
pnpm test           # turbo run test
pnpm dev            # turbo run dev (FE dev servers)

# E2E (Playwright) — boots the whole system automatically via webServer
cd e2e && pnpm exec playwright test
```

## 🔑 Environment variables

| Var                  | Where            | Default                 | Meaning |
| -------------------- | ---------------- | ----------------------- | ------- |
| `JWT_DEV_SECRET`     | root `.env`      | — (required by BFF)     | HS256 secret for dev JWTs |
| `VITE_JWT_DEV_SECRET`| root `.env`      | —                       | Same secret, FE side |
| `VITE_API_BASE_URL`  | FE build-time    | `http://localhost:8080` | BFF base URL (compose builds with `/api`) |
| `VITE_OIDC_*`        | shell `.env`     | —                       | OIDC authority/client/redirect for PKCE login |
| `GRPC_FULFILLMENT`   | BFF/Java         | `50051`                 | Port number or full `host:port` |
| `GRPC_BATCHING`      | BFF/Go           | `50052`                 | same |
| `GRPC_PRINT`         | BFF              | `50053`                 | same |
| `FULFILLMENT_ADDR`   | Go service       | `localhost:50051`       | Java endpoint Go calls to mutate orders |
| `SEED_PATH` / `CANONICAL_SEED_PATH` / `PRINT_SERVICE_SEED_PATH` | Java/Go/Python | `../../api/seed/canonical-seed.json` | Canonical seed path |
| `BFF_CORS_ORIGINS`   | BFF              | `:3000, :3001, :3002`   | CORS allow-list |
| `KAFKA_ENABLED`      | `.env`           | `false`                 | Opt-in event side-channel (`'true'` only when on) |
| `ENABLE_DEV_RESET_PASSWORD` | `.env`    | unset                   | Mounts dev-only `/auth/reset-password` (fail-safe: unset in prod → 404) |
| `BFF_ENABLE_API_DOCS` | BFF shell env   | unset                   | `'1'` = serve Swagger UI at `/documentation` (fail-safe: unset → 404, no UI routes) |
| `DRIFT_FULL`          | test env        | unset                   | `'1'` = drift-guard reverse check: every BFF route must belong to SOME spec file |

## 🧪 Testing

```bash
pnpm test                 # everything wired into Turborepo (TS workspaces)
cd services/fulfillment-service && ./run.sh test   # mvn test
cd services/batching-service    && go test ./...
cd e2e && pnpm exec playwright test                # full e2e (boot-all first)
```

- The BFF contract tests spin up **real gRPC mock servers** from the protobuf
  definitions and inject the Fastify app — no hand-rolled HTTP stubs.
- The e2e suites cover the main flows plus regression specs (`10xx` role
  matrix, `1100` order validation, `1200` fulfillment ops, `13xx` batching &
  realtime, `1401` KTV mobile, `15xx` SF-7 sweep) with per-suite config files.
- `E2E=1 bash scripts/boot-all.sh` resets both databases and the keycloak
  volume **before** booting, for a clean seeded state (`auth.setup.ts` logs 3
  users in through the hosted UI and stores storageState under `.auth/`).

## 📚 API docs (Swagger UI)

The BFF ships an interactive OpenAPI spec — **84 operations / 12 tags** —
covering every route the gateway exposes (System, Orders, Master Data,
Batches, Intake, Webhooks, Field Service, Delivery/D2C, COD Settlement,
Print, Administration, Realtime & Transfers).

```bash
# 1. Enable the docs plugin (fail-safe: unset = 404, nothing mounts)
BFF_ENABLE_API_DOCS=1 pnpm --filter @hub-store/bff-gateway dev

# 2. Open the UI
open http://localhost:8080/documentation

# 3. Mint a dev token and authorize ("Authorize" button → bearerAuth)
python3 e2e/scripts/mint_sf11.py manager /tmp/auth.json
#    → paste the token into Swagger UI Authorize (scheme: bearerAuth)
```

- **Spec source of truth**: `services/bff-gateway/openapi/` — a multi-file
  tree (`openapi.yaml` + `paths/*.yaml` + `components/*.yaml`) bundled
  in-memory at boot; the UI reads it from `GET /documentation/spec.json`.
  Read the YAML files directly to review request/response shapes and
  examples.
- **Try-it-out needs auth** for everything except `GET /healthz`,
  `GET /health`, `GET /version`: mint a token as above (role
  `manager|coordinator|admin`), click **Authorize**, paste the token.
- **Flag off = docs gone**: `BFF_ENABLE_API_DOCS` unset means no
  `/documentation` route, no spec JSON, no UI assets — safe for prod.

### Convention: route changed → spec changed, same PR

Every BFF route is guarded by a drift-guard vitest suite
(`services/bff-gateway/test/openapi.drift.*.test.ts`):

- each domain spec file (`paths/*.yaml`) is checked against the real
  Fastify route table — renaming/removing a route without updating its
  spec file **fails the default test** (`pnpm --filter
  @hub-store/bff-gateway test`);
- the other direction (a route **added** with no spec entry at all) is
  caught by the reverse check — run it manually at convergence time with
  `DRIFT_FULL=1 pnpm --filter @hub-store/bff-gateway test` (it is not
  wired into the default test script or CI, so run it before merging
  route changes);
- so: when you touch `src/routes/*`, update the matching
  `openapi/paths/*.yaml` **in the same PR**. If you only changed a
  response shape, update the schema/examples too — the spot-check that
  keeps docs honest is review, the drift-guard only catches the route
  surface.

## 👮 Roles and permissions

Roles come from Keycloak (`realm_access.roles`) and are mapped to permissions
by a single matrix shared by frontend and backend:

| Role              | Highlights                                              |
| ----------------- | ------------------------------------------------------- |
| Admin             | everything except audit; printer & area-staff management |
| Manager           | orders, users, audit, settlement — no printer admin     |
| Coordinator       | order coordination, COD confirmation                    |
| WarehouseOps      | warehouse picking operations                            |
| WarehouseEmployee | D2C only                                                |
| KTV / CTV         | technician & contractor mobile flows                    |

When changing a permission, update **both** the FE matrix
(`packages/shared/src/hooks/usePermissions.tsx`) and the BFF route guard in
the same change — the regression suite (`e2e/tests/1000-*`) asserts nav
visibility per role, and API-level gates must stay in sync with it.

## 🔐 OIDC auth (Keycloak)

- Start + auto-import the realm: `docker compose up -d keycloak` (realm JSON:
  `docker/keycloak/hubstore-realm.json`; `--import-realm` skips when the realm
  already exists — after changing realm/users run `docker compose down -v` to
  reset the keycloak-data volume and re-import).
- Shell login uses PKCE (public client `hubstore-web`); silent renew via
  refresh token; logout ends the Keycloak session. **Direct access grants are
  disabled** — login always goes through the browser.
- The BFF verifies RS256 via JWKS (`OIDC_ISSUER` / `OIDC_AUDIENCE` /
  `OIDC_JWKS_URL`); the role comes from the `realm_access.roles` claim and is
  forwarded as gRPC metadata `x-user-role`.

### Dev credentials (rotated — never use in prod)

> [!WARNING]
> Passwords below are dev-only.

The dev realm imports from `docker/keycloak/hubstore-realm.json`:

| User            | Password                | Notes                        |
| --------------- | ----------------------- | ---------------------------- |
| `coordinator`   | `gY0pM9SO7QEmqil_lWHQ`  | e2e (auth.setup storageState) |
| `warehouse`     | `gY0pM9SO7QEmqil_lWHQ`  | e2e                          |
| `manager`       | `gY0pM9SO7QEmqil_lWHQ`  | e2e (users/dashboard specs)  |
| `admin`         | `gY0pM9SO7QEmqil_lWHQ`  | e2e                          |
| `warehouse-emp` | `gY0pM9SO7QEmqil_lWHQ`  | e2e (SF-18 D2C)              |
| `ktv-001`       | `gY0pM9SO7QEmqil_lWHQ`  | ktv-mobile mint script       |
| `ctv-001`       | `GSzIMCBcUNtcbKwnTn_o`  | not on the shared e2e password |

E2E reads passwords from `e2e/lib/credentials.ts` (override with env
`E2E_PASSWORD`) — never re-hardcode literals inside specs.

### Secrets & rotation runbook

Every secret must be rotated **in lockstep** everywhere it appears — missing
one place causes token/secret drift at boot.

| Secret | Places to change together |
| ------ | ------------------------- |
| Admin client secret (`hubstore-admin`) | `docker/keycloak/hubstore-realm.json` (`clients[].secret`) + `docker-compose.yml` (`KC_ADMIN_CLIENT_SECRET` default) + `.env.example` + local `.env` |
| Realm user passwords (7 users) | `docker/keycloak/hubstore-realm.json` (`credentials[].value`) + `e2e/lib/credentials.ts` + `e2e/scripts/mint_*.py` scripts |
| `KEYCLOAK_ADMIN_PASSWORD` | compose default + local `.env` |
| `JWT_DEV_SECRET` / `VITE_JWT_DEV_SECRET` | local `.env` (no defaults in git — empty placeholders) |
| `INTERNAL_SERVICE_TOKEN` | local `.env` (compose reads `${INTERNAL_SERVICE_TOKEN:-}` — no default) |
| `POSTGRES_PASSWORD` | local `.env` (compose `:?` fails loudly — no default) |

Rotation procedure (dev realm):

1. Generate new values: `openssl rand -hex 16` (or `-base64 15` for passwords).
2. Edit the realm JSON (client secret + credentials — Keycloak hashes on import).
3. Edit the compose default, `.env.example`, `e2e/lib/credentials.ts` and mint
   scripts in the **same commit** (lockstep).
4. Reset the keycloak volume to re-import: `bash scripts/reset-db.sh`, then
   `docker compose up -d keycloak`.
5. Verify login with `E2E_PASSWORD=<new> python3 e2e/scripts/mint_sf11.py coordinator /tmp/auth.json`.
6. Production style: never use literals — secrets live in a secret manager or
   environment; realm JSON import is for dev only.

> [!CAUTION]
> Git history still contains OLD dev secrets (pre-SF-12 untracking) — do not
> reuse them; rotate every secret before any real deployment.

### Creating / changing Keycloak users

Realm import only runs when the `keycloak-data` volume is empty/new. To change
the realm JSON or add sample users:

```bash
# 1. Edit docker/keycloak/hubstore-realm.json (users[].username/credentials)
# 2. Reset the volume → clean realm re-import on next up
bash scripts/reset-db.sh          # includes removing the keycloak volume
docker compose up -d keycloak
# 3. Wait for the realm: curl -sf http://localhost:8081/realms/hubstore
```

Users created manually through the Admin Console (`http://localhost:8081`,
`admin` / `$KEYCLOAK_ADMIN_PASSWORD`) work too but are **not** persisted into
the realm JSON — a fresh container volume loses them.

### Forgot password (DEV-ONLY)

> [!WARNING]
> No identity verification step (no email, no OTP) — dev only.

The shell's "Forgot password" page and the `POST /auth/reset-password`
endpoint reset the password directly through the Keycloak Admin API. The
endpoint is only mounted when `ENABLE_DEV_RESET_PASSWORD=1` is explicitly set
(fail-safe: prod without it → 404). Replace with email OTP or Keycloak's
built-in forgot-password flow in production.

## 🤖 CI (GitHub Actions)

`.github/workflows/ci.yml` runs 3 jobs on every PR / push to main:

| Job            | Content                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `unit`         | `tsc --noEmit` (TS packages), Node unit tests, `go vet + test` (self-skips without a DB), `mvn test` (ITs skip without DB)  |
| `docker-build` | builds the 5 Dockerfiles (no push)                                                                                          |
| `e2e`          | Playwright with `E2E=1` — GH service `postgres:16.4` + a Keycloak container with `--import-realm` → `scripts/ci-e2e-boot.sh` → webServer `boot-all.sh` → `playwright test` |

**E2E password in CI:** the repo secret `E2E_PASSWORD` (when set) is used by
`ci-e2e-boot.sh` to rotate the 6 e2e user passwords after realm import, so CI
does not depend on the realm-JSON dev password.

**Local CI seam** (simulates the e2e job infra):

```bash
bash scripts/ci-e2e-boot.sh
# boots dedicated containers postgres-ci :55441 + keycloak-ci :18081
# (ports isolated from the main compose stack), creates both DBs,
# runs flyway + golang-migrate, seeds, grants kcadm manage-users, echoes READY.
```

Run one e2e spec CI-style:

```bash
E2E=1 pnpm --filter @hub-store/e2e exec playwright test tests/03-audit.spec.ts
```

## 💾 Backup / restore

```bash
# Backup both databases (postgres container must be running)
bash scripts/backup-db.sh        # dumps → gzip → backups/<db>-<ts>.sql.gz,
                                 # keeps BACKUP_KEEP (default 7), fails loudly
BACKUP_KEEP=14 bash scripts/backup-db.sh

# Manual
docker compose exec -T postgres pg_dump -U hubstore -d fulfillment > backup-fulfillment-$(date +%F).sql
docker compose exec -T postgres pg_dump -U hubstore -d batching    > backup-batching-$(date +%F).sql
```

Nightly cron (`crontab -e`):

```cron
0 2 * * * cd /path/to/hub-store && BACKUP_KEEP=7 bash scripts/backup-db.sh >> backups/backup.log 2>&1
```

(`backups/` is git-ignored — dumps contain data. A systemd user-timer variant
is documented in `scripts/backup-db.sh`.)

**Per-DB restore** (one database at a time, same cluster):

```bash
# 1. Stop apps — do NOT stop postgres (the DB container must run to restore into)
docker compose stop fulfillment-service batching-service bff

# 2. Drop + recreate ONLY the fulfillment DB
docker exec -i hub-store-postgres-1 psql -U hubstore \
  -c 'DROP DATABASE fulfillment WITH (FORCE);' -c 'CREATE DATABASE fulfillment;'

# 3. Restore from a backup (replace <ts>)
gunzip -c backups/fulfillment-<ts>.sql.gz | \
  docker exec -i hub-store-postgres-1 psql -U hubstore -d fulfillment

# 4. Repeat for batching (same pattern)
# 5. Start apps again
docker compose start fulfillment-service batching-service bff
#    migrations re-run as no-ops (history tables are in the dump); the
#    seed-verify boot check sees orders > 0 and does NOT overwrite data.
# 6. Verify
curl -s localhost:8080/health
```

Backups do **not** include the `keycloak-data` volume (users/realm) — restore
does not re-create Keycloak; that volume persists separately in compose.

## ☸️ Kubernetes (minikube)

Requirements: minikube ≥ 1.30, kubectl, Docker Desktop/OrbStack driver, and
**≥ 6GB RAM / 4 CPU** for the VM (3 JVM-backed services + Keycloak + Kafka —
the 2GB default will OOM):

```bash
minikube start --memory=6g --cpus=4
bash scripts/k8s-preflight.sh     # checks driver/resources/addons, non-zero on gaps
bash scripts/k8s-build-images.sh
bash scripts/k8s-deploy.sh
```

All secrets under `k8s/` are DEV-ONLY placeholders. The in-cluster Keycloak
uses a minimal dev realm exposed under the `/keycloak` prefix
(`KC_HTTP_RELATIVE_PATH` — matches the Ingress route). After editing
`realm-hub-store.json` + `kubectl apply`, you **must**
`kubectl -n hub-store rollout restart deployment/keycloak` — import only runs
at boot.

## 📐 Conventions

- **Contracts first** — protobuf definitions in `api/proto` are the single
  source of truth; generated stubs are committed. REST DTOs are camelCase and
  never leak proto field names.
- **Error envelope** — every non-2xx response is
  `{ statusCode, message, code, details? }` with stable machine codes
  (`PERMISSION_DENIED`, `UPSTREAM_UNAVAILABLE`, `VALIDATION_ERROR`, …).
- **Audit trail** — every mutation goes through the BFF, which writes
  `activity_log` directly to the fulfillment database (fail-open).
- **Secrets** — local-only in `.env`; never commit. Dev-only rotated literals
  live in the Keycloak realm JSON.

---

<div align="center">

## 🫱 Contributors

**HoiVu** — author / product owner · **Claude** (Anthropic) — AI coding agent · **Kiro** (AWS) — AI coding agent

*Built through human–AI agent collaboration.*

</div>
