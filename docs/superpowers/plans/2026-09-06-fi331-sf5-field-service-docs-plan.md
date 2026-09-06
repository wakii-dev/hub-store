# Plan — SF-5 Field Service docs (FI-331) — story FI-326

> Standard tier (spec slice trong context pack `docs/superpowers/contexts/sf-5.md`
> đã là contract — epic brainstorm + plan ở cấp story). File plan này do SF agent
> viết để phép tái lập: các task dưới đây được DOCUMENT post-hoc theo đúng trình
> tự thực thi thật (không manufacture quá khứ) — mỗi task gắn evidence đầu ra.
> Tier: Standard (2 file mới, spec-only, không DAG).

## Tasks

- [x] T1 — Author `services/bff-gateway/openapi/paths/tech.yaml`: 13 ops tag
  Field Service, shapes 1:1 từ `mappers/tech.ts` + `mappers/staffArea.ts` +
  proto (không DTO trong api-contracts), role gates per-endpoint đọc từ
  `routes/tech.ts` + `routes/serviceEmployees.ts`, statuses = enum string
  thường từ proto DeliveryStatus. Evidence: commit fe7127f.
- [x] T2 — Drift test scoped `test/openapi.drift.tech.test.ts`: assert đúng 13
  ops + `describeOpenApiDrift(['tech.yaml'])` (helper SF-1, không sửa file
  chung). Evidence: commit fe7127f; vitest xanh.
- [x] T3 — Full BFF vitest: 35/35 files, 406 passed, 1 skipped (DRIFT_FULL gate
  theo design). Cần `.env` worktree (copy từ main) — 12 test infra đỏ trước khi
  copy, xanh sau.
- [x] T4 — Browser verify Rule 0 (BFF :18085 + fulfillment host-run :50061 vì
  image container cũ thiếu TechService): Tầng 1 DOM 13/13 opblocks; Tầng 3 flow
  try-it-out GET /technicians/suggest?regionCode=R1 (token manager) → 200 +
  body khớp schema. Tầng 2 screenshot FAIL tool-side (browser_tab_closed —
  đúng pattern SF-1 đã ghi) → nhờ user xác nhận bằng mắt.
- [x] T5 — Independent code-reviewer trên diff 6260534..HEAD. Evidence: comment
  VERDICT trên FI-331.
- [x] T6 — Merge no-ff vào `story/fi326-api-docs-swagger` (playbook: merge
  parent vào sf-branch → ancestor guard → update-ref FULL refname → rev-list
  guard) + audit comment merge hash lên FI-331.
- [x] T7 — Gate cứng `~/.claude/bin/story-verify sf-5` sạch rồi mới set Done.

## Risks / decisions

- Bundler chỉ merge `doc.paths` → domain schemas ở top-level `x-schemas` +
  YAML anchors (InstallationOrder ×6). SF-3 đồng bộ chọn cùng pattern; P6 flag
  đã append improvements-log (d518ea5) để SF-9/chCoordinator thống nhất.
- Screenshot tool-side bất ổn (browser_tab_closed, about:blank reset) — đã lặp
  2 tab; flow vẫn PASS qua DOM clicks + live-response 200.
