# SF-11 Plan — Convergence + QA (FI-244)

> Spec: docs/superpowers/specs/ict-service-support-polyglot-spec.md v3 §5 SF-11 ·
> Context pack: docs/superpowers/contexts/sf-11.md · Bracket: FI-233 · Linear: FI-244.
> Branch: VuHoi/sf-11-convergence-qa → merge vào story/fi233-polyglot-grpc-mf (chỉ khi reviewer APPROVED + story-verify sạch).
> BOUNDARY: chỉ sở hữu `docker-compose.yml`, `README.md` (root), `e2e/**`, `scripts/**`.
> READ-ONLY: toàn bộ code SF-1..10. Fix bug convergence-specific được phép; đụng ownership SF cũ → ghi audit comment.

## Kiến trúc chốt (từ codebase probe — không đoán)

- **Port map** (README + .env): BFF :8080 · shell :3000 · orders :3001 · fulfillment :3002 ·
  gRPC Java :50051 / Go :50052 / Python :50053. Boot scripts: `services/*/run.sh` (3 services
  KHÔNG thuộc turbo); FE qua `pnpm dev` (turbo); BFF `pnpm --filter @hub-store/bff-gateway dev`.
- **Seed** (api/seed/canonical-seed.json): 27 orders · 7 batches · 6 đơn 30201 Chưa soạn
  (ORD-3001/RSA-700101 sample) · printers có shop 30201 · batches đủ 3 trạng thái.
  Order có 2 code: `fulfillCode` ORD-* (FE) + `orderCode` RSA-* (mutation contract FI-237).
- **gRPC contracts** (api/proto/hubstore/*/v1/*.proto, gen sẵn go/java/python/ts):
  FulfillmentService.MutateOrderStatus + GetOrdersByCodes · BatchingService.CreateBatch /
  CancelBatch / CompletePicking / PackingSuggest. Backend-integration test = script Node dùng
  gen ts clients (`@hub-store/bff-gateway` đã có @grpc/grpc-js + ts-proto) gọi TRỰC TIẾP Go/Java.
- **Auth stub** (SF-6): login giả lập → fake JWT HS256 (jose) ký cùng JWT_DEV_SECRET BFF verify;
  role switcher 3 roles; `firstPathForRole` theo PERMISSION_MATRIX (nav.ts — nguồn duy nhất).
- **Cross-remote invalidation**: createApi-level `refetchOnMountOrArgChange: true` (api-client
  singleton SF-1) — mount lại D2 luôn refetch. Verify bằng browser flow + assert E2E.
- **Docker**: Docker 20.10.21 + compose v2.13.0 có sẵn trên máy. Chưa có Dockerfile nào — SF-11
  tạo mới (nginx static cho shell+2 remotes theo SPIKE 1 publicPath; 4 service images).
- **Playwright**: chưa tồn tại — thêm workspace `e2e/` (`@playwright/test`, chromium),
  `webServer` array boot tuần tự: java → go → python → bff → 3 FE. CI=false, reuseExistingServer.

## Tasks

- [ ] Task 1 — **backend-integration-java-go**: boot Java + Go (KHÔNG FE); script
      `e2e/backend-integration.mts` (tsx, dùng gen ts stubs) gọi gRPC trực tiếp:
      CreateBatch (3 đơn 30201) → assert response batchCode + FilterOrders batchStatus=1
      (mutation THẬT trong Java) + GetOrdersByCodes hydration trả truth; CancelBatch →
      batchStatus revert 0; CompletePicking → batchStatus=2. Cả 2 loại code ORD/RSA chạy qua
      (FI-237 regression). Pass = assert hết không mis-wire.
- [ ] Task 2 — **e2e-playwright-main-flows**: workspace `e2e/` + playwright.config webServer
      boot toàn hệ thống; spec `main-flow.spec.ts` luồng §8: login Coordinator → D1 filter
      30201 → tick 3 đơn → D1b (DnD đổi thứ tự + packing suggest + thêm đơn + gán shipper +
      DatePicker) → tạo phiếu → D2 thấy phiếu → hủy → D1 đơn revert → tạo lại → In D3 (PDF
      preview render + In tất cả progress) → hoàn tất soạn → D2 COMPLETED.
- [ ] Task 3 — **cross-remote-invalidation-verify**: trong main-flow spec + browser manual:
      tạo phiếu ở orders → navigate fulfillment → D2 hiện phiếu mới không F5.
- [ ] Task 4 — **role-matrix-verify**: spec `role-matrix.spec.ts` + browser: Coordinator thấy
      D1+D2+Print; Ops login → landing D2, /order bị chặn (403/redirect), nav không có D1;
      Manager tất cả. Route gating + UI disable 2 tầng.
- [ ] Task 5 — **i18n-audit-binary**: spec `i18n-audit.spec.ts` — listener console
      `missing key`/i18next warning qua 5 screens × VI/EN → zero warning. Checklist post Linear.
- [ ] Task 6 — **cod-format-audit**: assert COD VI `15.000.000đ`-pattern (dấu chấm + đ) /
      EN `15,000,000 ₫`; formatPeriodOfTime `HH:mm DD/MM/YYYY – …` 2 locale nhất quán.
- [ ] Task 7 — **degraded-mode-kill-go**: MANUAL browser (không E2E — flaky): boot hệ thống,
      kill Go → D1 vẫn render, cột batchCode trống, mutation batches → 503 envelope
      `UPSTREAM_UNAVAILABLE`, không trắng trang; restart Go → hoạt động lại. Ảnh bằng chứng.
- [ ] Task 8 — **build-all-compose**: `pnpm build` turbo cache TẮT (`--force`) — verify
      remoteEntry prod; 3 Dockerfile FE (nginx, publicPath theo SPIKE 1) + 4 service images +
      `docker-compose.yml` (4 services + nginx FE). `docker compose up` smoke: login + D1 render.
- [ ] Task 9 — **readme-full**: README root: 1 lệnh dev (script boot-all hoặc hướng dẫn tuần
      tự), compose, port map, env vars, toolchain (java 17, go 1.19 pin grpc v1.56.3,
      python 3.14, node 24, pnpm 10.19, protoc/buf).
- [ ] Task 10 — **regression-8b-walkthrough**: full §8b 25 dòng (D1 9 + D1b 7 + D2 5 + D3 4)
      browser Rule 0 3 tầng; checklist từng dòng pass/fail post Linear comment.
- [ ] Task 11 — **final-gate-story-close**: reviewer APPROVED (diff SF-11) + verifier +
      security-audit (diff tổng story → /tmp/story/fi233/security-sf11.md) + story-verify sf-11
      sạch → merge no-ff vào story/fi233-polyglot-grpc-mf (chuỗi merge-ngược + guard
      merge-base) + audit comment merge-hash + STORY-CLOSE verify (sub-issues Done, worktrees,
      Epic Done) → FI-244 Done CUỐI.

## Acceptance (context pack)
- Luồng §8 E2E pass browser (ảnh/video bằng chứng) · 3 roles gate đúng · VI/EN zero missing key ·
  COD 2 locale đúng · kill Go degrade không crash · compose + README người mới chạy được ·
  §8b 25/25 pass (checklist Linear).
