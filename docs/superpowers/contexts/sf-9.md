# SF-9 Context Pack — Convergence (verify toàn cục + regression + README + story close)

> Đọc file này THAY VỊ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-bff-api-docs-swagger-design.md` ·
> Plan: `docs/superpowers/plans/2026-09-06-fi326-api-docs-swagger-plan.md` ·
> Bracket: `docs/superpowers/brackets/fi326-api-docs-swagger.md`
> Chạy SAU KHI tất cả SF-2..8 merged về nhánh đích `story/fi326-api-docs-swagger`.

## Spec slice (chỉ phần SF-9 chịu trách nhiệm)

1. **Bring-up nhánh đích**: verify mọi sf-branch đã merged (`git rev-list
   --count story/fi326-api-docs-swagger..sf-<n>` = 0 từng branch), nhánh
   đích sạch. Ngữ cảnh: tier-1 chạy 2 wave (SF-2..5 trước, SF-6..8 sau),
   mỗi SF run tự merge về nhánh đích với ancestor-guard khi Done — bạn chỉ
   bắt đầu sau khi CẢ 7 merged; KHÔNG tự merge giúp SF nào.
2. **Full drift-guard 84/84** chạy trên nhánh đích — bật `DRIFT_FULL=1`
   (assertion NGƯỢC: mọi route harness phải thuộc SOME spec file — semantics
   SF-1 pin) + chạy lại **negative control** (route giả → đỏ → revert) +
   **spot-audit examples**: đối chiếu examples/response schema của ≥1 op
   đại diện mỗi file paths với contract tests thật
   (`services/bff-gateway/test/*.contract.test.ts`) — bắt shape lệch.
3. **Spec load pass**: parser load toàn bộ multi-file `$ref` — 0 broken
   link (UI build không lỗi console).
4. **UI walkthrough TOÀN BỘ 12 tags** trên nhánh đích (browser, Rule 0
   DOM/VISUAL/FLOW — evidence từng tag): 84 ops render đúng bảng §4 spec.
5. **Try-it-out matrix**: ≥1 endpoint mỗi tag (12 tags) chạy OK với dev
   token (`python3 e2e/scripts/mint_sf11.py manager /tmp/auth.json`) —
   matrix kết quả ghi Linear.
6. **Secrets audit BINARY** (spec §5 AC6): `grep -rE
   "gY0pM9SO7QEmqil_lWHQ|GSzIMCBcUNtcbKwnTn_o"
   services/bff-gateway/openapi/` = 0 hit + không password example thật.
7. **Regression**: `pnpm test` toàn workspace + e2e Playwright (`E2E=1 bash
   scripts/boot-all.sh` rồi `cd e2e && pnpm exec playwright test`) — toàn
   xanh, KHÔNG test nào phải sửa.
8. **README**: section "API docs" — cách bật `BFF_ENABLE_API_DOCS=1`, mở
   `/documentation`, lấy dev token (mint script), đọc spec YAML, quy tắc
   "sửa route phải sửa spec cùng PR (drift-guard bắt)" vào conventions.
9. **Story close**: merge state sạch, Linear audit comment epic (SF→issue→
   merge-hash map + nhánh đích), PR nhánh đích → main (gh pr create) —
   NGƯỜI merge, agent chỉ mở PR.

## Touch map (files SF-9 tạo/sở hữu)

```
README.md                       # EDIT: section "API docs" + conventions note
```
Kiểm-toán READ-ONLY: toàn bộ `services/bff-gateway/openapi/**` (chỉ đọc,
chạy drift + load + UI — KHÔNG sửa nội dung domain; phát hiện sai → flag
SF owner qua Linear, chỉ fix P0 chặn acceptance với note rõ).
Regression chạy trên nhánh đích (worktree riêng nếu cần).

## ACCEPTANCE (user-visible)

Đúng 7 acceptance criteria epic (spec §5) — từng mục binary:
1. UI mở được, 84 ops / 12 tags đúng bảng.
2. Try-it-out: regions + POST /fulfillment/filter (token) + /healthz
   (không token) OK.
3. Drift-guard bắt được lệch (test đỏ khi thêm route giả — demo 1 lần).
4. Spec load pass — UI không broken.
5. `pnpm test` + e2e toàn xanh.
6. Secrets grep = 0 hit.
7. README có section API docs.

## Boundary (KHÔNG làm)

- KHÔNG merge vào main — chỉ mở PR; merge là quyền người.
- KHÔNG sửa nội dung spec domain (chỉ flag/fix P0 với note).
- KHÔNG đụng route/mapper/runtime code.
- KHÔNG xóa worktree SF khác (cleanup là bước CLOSE của coordinator).
