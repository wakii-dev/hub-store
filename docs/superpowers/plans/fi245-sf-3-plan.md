# Plan — FI-245 SF-3: Batches Go → Postgres (FI-248)

Spec: docs/superpowers/contexts/fi245-sf-3.md (spec slice + ACCEPTANCE + boundary — nguồn duy nhất).
Worktree: sf-3-batches-postgres (branch VuHoi/sf-3-batches-postgres) → dest story/fi245-postgres-production.

## Phase 0-mini — key findings + decisions

1. **Column contract đã cốết bởi SF-1** (`scripts/seed-db.sh` header): `batches(batch_code, shop_code, shipper_id, delivery_time_from, delivery_time_to, status, created_at)`, `batch_items(batch_code, stop_order, order_code, customer_address, distance, from_delivery_time, to_delivery_time, order_status, order_type, items jsonb, total_quantity, cod_amount)`, sequence `batches_code_seq`. Schema V1 PHẢI khớp 1:1.
2. **Boot không phụ thuộc Java**: hiện `NewGRPCClient` dial `WithBlock` 5s → boot chết nếu Java down → vi phạm ACCEPTANCE. Fix trong `main.go` (owned): dial non-blocking (lazy connect, gRPC tự reconnect) + wrap `NewGRPCClientFromConn` — `internal/fulfillment/client.go` GIỮ READ-ONLY.
3. **Sequence bootstrap**: migrate tạo `batches_code_seq` (setval 1, is_called=false); `PostgresStore.Open` chạy ensure-bootstrap: setval = GREATEST(max numeric suffix của batch_code trong bảng, current last_value); bảng rỗng → setval 1,false (create đầu = BATCH-0001). Seed pipeline (SF-1) cũng setval khi nạp — idempotent cả 2 phía.
4. **Test DB riêng** `batching_test` (tạo nếu thiếu, nối vào `postgres` maintenance DB) — tests TRUNCATE + nạp fixture từ canonical-seed.json KHÔNG đụng data dev `batching`. Skip-if-no-DB qua ping fail. Migrations apply bằng đọc file .up.sql (KHÔNG thêm migrate Go lib — binary golang-migrate nằm ở compose `batches-migrate` (SF-1, pin v4.17.1) + Dockerfile entrypoint).
5. **pgx pin**: host toolchain go1.19.4 → pin `github.com/jackc/pgx/v5 v5.5.5` (cuối cùng hỗ trợ go 1.19). go.mod KHÔNG thêm lib khác.
6. **Interface có error returns** — bắt buộc cho I/O Postgres; server map: DB error → `Internal`, CAS miss (nil,nil) → giữ nguyên NotFound/FailedPrecondition logic. RPC logic KHÔNG đổi.
7. **CreatedAt timestamptz**: seed `+07:00` chuẩn hoá về UTC khi đọc ra (RFC3339) — ordering `ORDER BY created_at, batch_code` giữ đúng semantics tuyệt đối của sort cũ.

## Tasks

1. **migrations-v1** — `services/batching-service/migrations/000001_batches_init.{up,down}.sql` (2 bảng + sequence, timestamptz, jsonb, PK/PK composite).
2. **go-mod-pgx + testdb** — go.mod pin pgx v5.5.5; `internal/testdb` helper: tạo `batching_test`, apply migrations, TRUNCATE, seed fixture từ canonical-seed.json, trả *pgxpool.Pool.
3. **store-postgres** — `internal/store/store.go` viết lại: `BatchStore` interface (List/Get/Put/Delete/CreateWithNextCode/Transition/NextBatchCode) + `PostgresStore` (pgxpool): CAS UPDATE rowsAffected, nextval + insert tx, hydration batch+items → proto, bootstrap setval; XOÁ map in-memory + LoadSeedFile + seed structs; giữ ParseTime.
4. **server + main + tests** — `batching_server.go` đổi type store → interface + map error; `main.go` env `BATCHING_DB_HOST/PORT/NAME/USER/PASSWORD` + lazy dial Java; `store_test.go`/`batching_test.go` qua testdb (skip khi không DB); giữ toàn bộ assertion cũ.
5. **dockerfile + run.sh** — Dockerfile stage `COPY --from=migrate/migrate:v4.17.1 /migrate` + entrypoint wait-for-db → migrate up → exec serve; run.sh gọi scripts/wait-db.sh + env DB.

## Test strategy

- `go test ./...` với TEST DB env → full integration (store CAS/next-code + 16 server test giữ assertion cũ).
- Không DB → skip (t.Skipped) — unit-only vẫn pass.
- ACCEPTANCE standalone (Rule 0): compose up postgres + batches-migrate + db-seed → psql thấy BATCH-0001; run Go service với Postgres (KHÔNG có Java) → list qua grpcurl/psql proof; CreateBatch persistence + restart; 2 create song song → 2 code khác nhau.

## Boundary check

Proto/RPC logic/hydration flow/compensation KHÔNG đổi; compose/SF-1, Java/SF-2, auth/SF-4 không đụng; batchCode format `BATCH-%04d` giữ nguyên.
