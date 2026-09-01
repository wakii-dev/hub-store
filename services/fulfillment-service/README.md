# fulfillment-service (SF-3 / FI-237)

Java gRPC service của khối fulfillment (spec §3.3) — **KHÔNG thuộc turbo**:
`pnpm dev` ở repo root KHÔNG đụng service này. Build/chạy riêng hoàn toàn.

## Chạy standalone

```bash
cd services/fulfillment-service
./run.sh            # boot server :50051 (Spring Boot 3.5.5 + grpc 1.69.0)
```

- Port: `50051`, override bằng env `GRPC_FULFILLMENT` (vd `GRPC_FULFILLMENT=50061 ./run.sh`).
- Java 17+ (dev trên Java 21, Maven release 17). Toolchain: Maven 3.9.

## Seed

Nguồn dữ liệu duy nhất: `api/seed/canonical-seed.json` (SF-2 authored — service
KHÔNG tự seed riêng). Load lúc boot + **fail-fast validate** (≥25 đơn, shop
30201 ≥5 đơn Chưa soạn, đủ batchStatus 0-3, có đơn chia nợ).

Path resolution (thứ tự, lấy file đầu tiên tồn tại):

1. env `SEED_PATH` (đường dẫn đến file json) — khuyến nghị khi chạy từ
   thư mục khác;
2. `../../api/seed/canonical-seed.json` (mặc định — chạy từ `services/fulfillment-service/`);
3. `../api/seed/canonical-seed.json` (chạy từ `services/`);
4. `api/seed/canonical-seed.json` (chạy từ repo root).

## Smoke

```bash
./run.sh            # terminal 1 — chờ dòng "Started FulfillmentServiceApplication"
./run.sh smoke      # terminal 2 — SmokeClient gRPC
```

Output mong đợi:

```
[SMOKE] FilterOrders total = 27  (PASS ≥25)
[SMOKE] Shop 30201 Chưa soạn = N  (PASS ≥5)
[SMOKE] SMOKE PASS
```

(`grpcurl` không có sẵn trên máy dev — SmokeClient Java là smoke path chính.
Nếu có grpcurl: `grpcurl -plaintext -d '{"page":1,"pageSize":100}' localhost:50051
hubstore.fulfillment.v1.FulfillmentService/FilterOrders`.)

## Test

```bash
./run.sh test       # = mvn test (JUnit 5, 23 tests)
mvn -q -DskipTests package   # build jar
```

## Gencode proto

Generated code **KHÔNG copy** vào module — build wire trực tiếp vào
`../../api/proto/gen/java` qua `build-helper-maven-plugin` (READ-ONLY, SF-2
owns; đổi proto = REQUIREMENT-GAP lên epic FI-233). Pins: `protobuf-java
4.29.3` (khớp protoc 29.3 của SF-2), `io.grpc` BOM 1.69.0,
`net.devh:grpc-server-spring-boot-starter 3.1.0.RELEASE`.

## Lỗi validation (contract pin SF-2)

Reject = gRPC `INVALID_ARGUMENT` + metadata key `x-error-details` =
`encodeURIComponent(JSON [{field,message}])` — BFF decode ở
`services/bff-gateway/src/lib/grpc-error.ts` thành HTTP 422 `details[]`.
Java percent-encode thay `+` → `%20` để khớp `decodeURIComponent` phía JS.
