# SPIKE 4 — Multi-language gRPC codegen (java + go + python + ts) — VERDICT

- **SF-1 / Linear FI-234** · Date: 2026-08-31
- **Goal:** prove all 4 target languages generate AND compile (or import) from ONE proto.
- **Sandbox:** `/tmp/sf1-spikes/spike4/` (nothing touched in repo except this doc; `api/**` untouched).
- **Proto:** `fulfillment_spike.proto` — package `fulfillment.v1`, Order/FilterRequest/FilterResponse + `FulfillmentService.FilterOrders` rpc.

## GO / NO-GO: **GO**

All 4 languages passed codegen AND compile/import in the sandbox. SF-2 can build real protos with the pinned toolchain below. Only caveats are version deviations (go 1.19, java 21 vs spec 17) — both proven to work with the pins listed here.

## Verdict summary

| Language | Codegen | Compile / Import | Plugin / versions | Notes |
|---|---|---|---|---|
| Go | PASS | PASS (`go build ./...`) | protoc-gen-go v1.28.1, protoc-gen-go-grpc v1.2.0 | pinned for go 1.19 (latest plugins need go ≥1.21) |
| Java | PASS | PASS (`javac`) | protoc-gen-grpc-java 1.64.0 (osx-aarch_64) | needs protobuf-java **4.x** (see jar list) |
| Python | PASS | PASS (import check, incl. message construction + Stub class) | grpcio-tools 1.83.1 | py3.14 works in a venv; system pip is PEP 668-locked |
| TypeScript | PASS | PASS (`tsc --strict --noEmit`) | buf 1.72.0 + @bufbuild/protoc-gen-es 2.14.0 | buf.gen.yaml works — buf is NOT a blocker |

## Toolchain (actual, incl. deviations)

| Tool | Version | Deviation from spec | Impact |
|---|---|---|---|
| protoc | 29.3 (libprotoc) | — | none |
| buf | 1.72.0 via `npx @bufbuild/buf` | buf not installed globally | use npm-installed binary (below) — works |
| go | **1.19.4** | spec wants ≥1.21 | pin protoc-gen-go **v1.28.1** + protoc-gen-go-grpc **v1.2.0**; module pins: `google.golang.org/grpc v1.56.3`, `google.golang.org/protobuf v1.30.0` (tidy resolved; build clean). Upgrade go → lift pins. |
| java | **21.0.8** | spec says 17 | javac 21 compiles fine for SF-2 dev; if CI targets 17 runtime, set `--release 17` — not tested in spike |
| python | **3.14.3** | very new | grpcio/grpcio-tools **1.83.1** ship cp314 wheels — install in a **venv** (system pip is PEP 668-blocked). protoc's `--grpc_python_out` alone needs the external `grpc_python` plugin, so use `python -m grpc_tools.protoc`. |
| node | 24.10.0 | — | none; typescript compiler resolved to 7.0.2 (native preview) — compiles generated TS clean |

## Working commands (exact, from sandbox)

### 0. Proto source of truth
`fulfillment_spike.proto` with header options:
```proto
option go_package = "spike/gen/go/fulfillment/v1;fulfillmentv1";
option java_multiple_files = true;
option java_package = "com.ict.fulfillment.v1";
```

### 1. TypeScript (buf — recommended for SF-2)
Install once: `npm i -D @bufbuild/buf @bufbuild/protoc-gen-es @bufbuild/protobuf`

`buf.gen.yaml` (v2, local plugin):
```yaml
version: v2
plugins:
  - local: protoc-gen-es
    out: gen/ts
    opt:
      - target=ts
```
Run (buf must NOT scan foreign dirs — venv broke it; pass the file explicitly or add `buf.yaml` with excludes):
```sh
PATH="$(npm bin):$PATH" buf generate path/to/proto/file.proto
```
Verify: `tsc --noEmit --strict --target es2020 --module esnext --moduleResolution bundler gen/ts/*_pb.ts` → PASS.
Runtime dep: `@bufbuild/protobuf` 2.14.0. NOTE: protoc-gen-es v2 emits **protobuf-es** (no ready-made gRPC transport client like grpc-web/ts-proto out of the box). If the FE needs plain `grpc`-compatible clients, consider **ts-proto** as fallback — spike did not test it; protoc fallback for TS (no buf) is also acceptable: `protoc --plugin=protoc-gen-es --es_out=gen/ts`.

### 2. Go
```sh
GOBIN=/tmp/sf1-spikes/bin go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.28.1
GOBIN=/tmp/sf1-spikes/bin go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.2.0

PATH=/tmp/sf1-spikes/bin:$PATH protoc -I. \
  --go_out=gen/go --go_opt=module=spike/gen/go \
  --go-grpc_out=gen/go --go-grpc_opt=module=spike/gen/go \
  fulfillment_spike.proto
# go.mod: module spike/gen/go; require grpc v1.56.3, protobuf v1.30.0; go 1.19
go mod tidy && go build ./...   # PASS
```

### 3. Java
Plugin: `protoc-gen-grpc-java-1.64.0-osx-aarch_64.exe` from maven central (`io/grpc/protoc-gen-grpc-java/1.64.0/...osx-aarch_64.exe`, chmod +x).
```sh
protoc -I. --java_out=gen/java \
  --plugin=protoc-gen-grpc-java=<path-to-plugin> \
  --grpc-java_out=gen/java fulfillment_spike.proto
```
Compile-time classpath jars (all maven central, exact versions used):
```
com/google/protobuf/protobuf-java/4.29.3   (MUST be 4.x — protoc 29.3 gencode calls RuntimeVersion; 3.25.x fails with 29 errors)
io/grpc/grpc-stub/1.64.0
io/grpc/grpc-api/1.64.0
io/grpc/grpc-protobuf/1.64.0               (required: io.grpc.protobuf.ProtoUtils / descriptor suppliers)
io/grpc/grpc-protobuf-lite/1.64.0
io/grpc/grpc-context/1.64.0
com/google/guava/guava/33.0.0-jre          (ListenableFuture)
com/google/guava/failureaccess/1.0.2
org/apache/tomcat/annotations-api/6.0.53   (javax.annotation.Generated)
```
```sh
javac -cp "<jars joined by :>" $(find gen/java -name '*.java')   # PASS
```
(In SF-2 real build this is Maven/Gradle's job — the jar list above = the transitive set to expect.)

### 4. Python
```sh
python3 -m venv venv && ./venv/bin/pip install grpcio grpcio-tools protobuf
# versions: grpcio 1.83.1, grpcio-tools 1.83.1, protobuf 7.36.0
./venv/bin/python -m grpc_tools.protoc -I. \
  --python_out=gen/python --grpc_python_out=gen/python fulfillment_spike.proto
PYTHONPATH=gen/python ./venv/bin/python -c \
  "import fulfillment_spike_pb2, fulfillment_spike_pb2_grpc; \
   print(fulfillment_spike_pb2.Order(code='x'))"   # IMPORT PASS
```
Imported message construction AND `FulfillmentServiceStub` class both verified. Runtime server test not in scope (import-level proof sufficient for codegen spike).

## Gotchas found (feed into SF-2)

1. **buf scans everything under the input dir** — a python venv containing grpc_tools' bundled descriptor.proto broke `buf generate` with a resolve error. Pass explicit file paths or configure `buf.yaml` excludes.
2. **protoc 29.3 java gencode requires protobuf-java 4.x runtime** — do NOT pull 3.25.x from old BOMs.
3. **`protoc --grpc_python_out` is NOT built-in** — it needs the external `grpc_python` plugin (from grpcio-tools). Use `python -m grpc_tools.protoc`.
4. **go plugin pins are go-1.19-bound**; when go is upgraded to ≥1.21, bump to latest protoc-gen-go(‑grpc) and grpc module versions.
5. **protobuf-es (protoc-gen-es v2) vs ts-proto choice left open** — codegen+compile proven for protobuf-es; client-transport ergonomics for the FE not compared. SF-2 should decide per FE gRPC transport needs.
6. Python imports need the generated dir on `PYTHONPATH` and the package structure mirrored (`fulfillment/v1/...` in real layout → keep `--proto_path` root stable).

---

## In-repo verification (SF-2, FI-235)

- **Date:** 2026-09-01 · **Scope:** real production protos (`api/proto/hubstore/*/v1/`) — 3 files, 22 RPCs total. Sandbox verdict above kept unchanged; this section proves it holds IN-REPO with the real contracts.
- **Layout:** protos at `api/proto/hubstore/{fulfillment,batching,print}/v1/` (buf `PACKAGE_DIRECTORY_MATCH`); gen committed at `api/proto/gen/{ts,go,java,python}/`.
- **Envelope convention (authored this SF):** per-RPC `<Rpc>Request/Response` (buf STANDARD), list responses carry `items + total + page + page_size` inline → REST `{items, total, page, pageSize}`; datetimes = ISO-8601 strings (mirror shared `TimeRange`); `int64` renders as JS number via ts-proto `forceLong=number` (values « 2^53).

### GATE: PASS — all 4 languages compile from the real protos

| Language | Codegen | Compile | Toolchain (exact) |
|---|---|---|---|
| buf lint | PASS | — | `npx @bufbuild/buf@1.72.0 lint .` (cwd `api/proto`) — 0 findings |
| Go | PASS | **PASS** `go build ./...` | protoc 29.3 + protoc-gen-go v1.28.1 + protoc-gen-go-grpc 1.2.0; `go 1.19.4`; `google.golang.org/grpc v1.56.3` + `protobuf v1.30.0` (pinned — tidy initially drifted to v1.57/v1.31, re-pinned via `go get @v1.56.3 @v1.30.0`, rebuild clean) |
| Java | PASS (128 .java) | **PASS** `javac` exit 0 | protoc 29.3 + protoc-gen-grpc-java 1.64.0 (osx-aarch_64); classpath `protobuf-java 4.29.3` (NOT 3.25.x — protoc 29.3 gencode) + grpc-stub/api/protobuf(-lite)/context 1.64.0 + guava 33 + failureaccess + annotations-api 6.0.53 |
| Python | PASS | **PASS** `py_compile` + import + message/Stub construction | grpcio-tools 1.83.1 (venv, py 3.14.3); `PYTHONPATH=gen/python` imports all 6 modules |
| TypeScript | PASS | **PASS** `tsc --strict --noEmit` | ts-proto **2.7.7** (plugin bin renamed `protoc-gen-ts_proto`); runtime **@bufbuild/protobuf 2.14.0** (ts-proto 2.x switched from protobufjs); `outputServices=grpc-js,forceLong=number,esModuleInterop=true` |

### Working commands (in-repo, cwd = `api/proto`)

```sh
# buf lint
npx @bufbuild/buf@1.72.0 lint .

# Go (plugins in /tmp/sf1-spikes/bin)
PATH=/tmp/sf1-spikes/bin:$PATH protoc -I . \
  --go_out=gen/go --go_opt=module=hubstore/gen/go \
  --go-grpc_out=gen/go --go-grpc_opt=module=hubstore/gen/go \
  hubstore/{fulfillment,batching,print}/v1/*.proto
cd gen/go && go build ./...        # go.mod pins grpc 1.56.3 / protobuf 1.30.0

# Java
protoc -I . --java_out=gen/java \
  --plugin=protoc-gen-grpc-java=/tmp/sf1-spikes/spike4/jars/protoc-gen-grpc-java-1.64.0-osx-aarch_64.exe \
  --grpc-java_out=gen/java hubstore/{fulfillment,batching,print}/v1/*.proto
javac -cp "<jars §3 above>" -d /tmp/out $(find gen/java -name '*.java')

# Python (venv with grpcio-tools 1.83.1)
python -m grpc_tools.protoc -I . --python_out=gen/python --grpc_python_out=gen/python \
  hubstore/{fulfillment,batching,print}/v1/*.proto
find gen/python -name '*.py' -exec python -m py_compile {} +
PYTHONPATH=gen/python python -c "from hubstore.fulfillment.v1 import fulfillment_pb2, fulfillment_pb2_grpc"  # + batching/print

# TypeScript
protoc -I . --plugin=protoc-gen-ts_proto=<path> \
  --ts_proto_out=gen/ts --ts_proto_opt=outputServices=grpc-js \
  --ts_proto_opt=forceLong=number --ts_proto_opt=esModuleInterop=true \
  hubstore/{fulfillment,batching,print}/v1/*.proto
tsc --strict --noEmit gen/ts/hubstore/*/v1/*.ts   # needs @bufbuild/protobuf + @grpc/grpc-js resolvable
```

### Decisions + deltas vs sandbox verdict (feed SF-3/4/5/7)

1. **buf lint STANDARD except `ENUM_ZERO_VALUE_SUFFIX`** (buf.yaml documents why): domain zero values are meaningful wire codes pinned to `packages/shared/src/enums.ts` (0 = NOT_PREPARED / PENDING_APPROVAL / ACTIVE). print.PrintType DOES have UNSPECIFIED=0 (synthetic, not on wire).
2. **ts-proto over protobuf-es** for the BFF (Task 7): grpc-js service clients needed. ts-proto 2.x runtime is `@bufbuild/protobuf` (not protobufjs) — pin `@bufbuild/protobuf@2.14.0` alongside `ts-proto@2.7.7`.
3. **ts-proto 2.x plugin binary is `protoc-gen-ts_proto`** (not `protoc-gen-ts` as in 1.x docs) — protoc `--plugin` name must match.
4. **`go mod tidy` drifts pins** (pulled grpc v1.57/protobuf v1.31 on go 1.19) — regenerate with `go get @v1.56.3 @v1.30.0` before tidy, or accept the bump consciously. SF-4 owns this module (`api/proto/gen/go/go.mod`).
5. **Package dirs:** go module `hubstore/gen/go` · java `com.hubstore.*.v1` · python mirrors proto path (namespace packages, no `__init__.py` needed on `PYTHONPATH`).
6. Gen output of ALL 4 languages is committed (`api/proto/gen/**`) so SF-3/4/5 can review contracts without regenerating; proto change = regenerate all 4 (spec §3.2 freeze).

