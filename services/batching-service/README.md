# batching-service (Go, gRPC :50052)

SF-4 / FI-238 — Go gRPC service sở hữu **batches store** (in-memory, seed từ
`api/seed/canonical-seed.json` lúc boot — một nguồn, KHÔNG seed riêng).
Contract: `api/proto/hubstore/batching/v1/batching.proto` (SF-2, FROZEN).

## Run standalone

```bash
./run.sh          # :50052, seed path tự resolve, Java tại localhost:50051
```

Env (tuỳ chọn):

| Var                   | Default                                | Ý nghĩa                          |
|-----------------------|----------------------------------------|----------------------------------|
| `BATCHING_PORT`       | `50052`                                | Port gRPC                        |
| `FULFILLMENT_ADDR`    | `localhost:50051`                      | Java fulfillment-service         |
| `CANONICAL_SEED_PATH` | `<repo>/api/seed/canonical-seed.json`  | Canonical seed fixture           |

Java chưa chạy? Dùng dev stub (KHÔNG thay thế verify thật — SF-11 làm):

```bash
go run ./cmd/mock-fulfillment &   # mock Java trên :50051 (seed-backed)
./run.sh &                        # batching-service trên :50052
```

Smoke:

```bash
grpcurl -plaintext -d '{"batchCode":"BATCH-0001"}' \
  localhost:50052 hubstore.batching.v1.BatchingService/GetBatchDetail
```

## RPC (8 — proto pin)

| RPC | Semantics |
|---|---|
| `CreateBatch` | Rule 1 §3.6 server-side: `GetOrdersByCodes` → Java lấy truth, reject khác kho / `batchStatus≠0`; sinh `batchCode` (`BATCH-NNNN` từ max+1) + `stopOrder` theo thứ tự `fulfill_codes` (DnD); rồi `MutateOrderStatus` → Java (`PREPARING`), fail → rollback batch |
| `FilterBatches` | search (số phiếu HOẶC số đơn) + statuses + createdTime range + pagination |
| `GetBatchDetail` | 404 nếu không thấy |
| `CancelBatch` | Rule 4: chỉ `ACTIVE`; revert đơn `NOT_PREPARED` qua Java (+reason); reject `FailedPrecondition` |
| `GetBatchCriteria` | `[ACTIVE]` |
| `CompletePicking` | `ACTIVE → COMPLETED`, đơn `PREPARED` qua Java |
| `PackingSuggest` | Hydrate → sort theo km tăng dần → greedy nhóm (≤2km giữa đơn liên tiếp); thứ tự trong nhóm = đề xuất giao |
| `RecalculateDistance` | Hydrate → km truth từ Java (thiếu → derive deterministic từ địa chỉ) |

shopCode: BFF gửi trống → Go derive từ hydration truth (spec §3.3).

## Tests

```bash
go test ./...     # unit + integration qua bufconn gRPC thật + mock Java
go vet ./...
go build ./...
```

Mock Java server (`internal/mockfulfillment`) là seed-backed stub đúng
contract — hydration/mutation được mock-verify; chain Go→Java THẬT do SF-11
verify backend-only (boundary).

## Known limitations

- `x-user-role` metadata: services tin BFF, không enforcement (spec §3.9 known-limitation).
- `go 1.19` toolchain thực tế của máy — pin `grpc v1.56.3` / `protobuf v1.30.0` khớp gen code SF-2.
- KHÔNG đăng ký turbo — service chạy standalone bằng run script.
