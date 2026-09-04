# SF-8 Convergence Regression (FI-288) — Plan of Record

> **Status:** Executed — documented at convergence (2026-09-05). Plan-of-record retroactive:
> 13-step run checklist từ Linear issue FI-288, tick kèm bằng chứng commit/run sau khi
> toàn bộ steps hoàn tất. Không step nào được tick trước khi có evidence thật.

**Worktree:** sf-8-convergence · **Dest:** story/qa-hub-store-regression · **Linear:** FI-288

## Tasks

- [x] 1. Merge-order verify — dest chứa đầy đủ 6 sweep đã merge (SF-1..SF-7). Verified ancestor guards trước khi boot.
- [x] 2. Full e2e suite trên dest — 25 specs cũ + regression 10xx–15xx + 7 seam suites GREEN: 09-ktv 7/7, 1401 6/6 (sf-6 seam), 08-audit-viewer 6/6, 08-export 3/3, 08-mobile 2/2 (sf-11 seam), 09-webhook 6/6 (sf-26 seam), 08-print-expansion 13/13 (sf-21 seam).
- [x] 3. Reset-db replay trên dest — 108/108 reachable tests PASS (91 + 7 pg-seam + 12 seam, chia 3 run theo env gate). 0 bug app mới; 2 bug spec fix: download-handler leak 05-d2c (f3a721a), seed qua-đêm 1401 (8a92d07).
- [x] 4. Cross-flow sanity — build 7/7 PASS; tsc production-code clean sau fix PrintPage union cast + MarkFailModal data-testid cast (972bf7e); 02-role-matrix PASS trong replay. (FE build = vite build thuần, KHÔNG typecheck — improvements-log OPEN.)
- [x] 5. [PERM] bug queue — EMPTY (không còn [PERM].failure tồn đọng từ các sweep).
- [x] 6. Bug traceability — 13 bug P0–P2 ↔ regression specs: mỗi bug đúng 1 spec PASS, 0 lọt. Bảng trong comment FI-288.
- [x] 7. P3 consolidation — 6 P3 + 2 latency + 1 phantom consolidate → comment epic FI-280 (marked "reconstructed from plan/state").
- [x] 8. Final browser walkthrough — login → orders → fulfillment D1 → batch → D3 print 5 tabs → logout (KC session end thật — BUG-2 verify) qua orca browser. PASS.
- [x] 9. ACCEPTANCE verify từng dòng spec slice fi280-sf-8.md — 6/6 dòng PASS.
- [x] 10. Code-reviewer độc lập — VERDICT: APPROVED (0 P0/P1, 4 P2; 2 fix commit 6791db4).
- [x] 11. Merge no-ff vào dest — merge commit **bcc6130** trên story/qa-hub-store-regression (chứa 8a92d07, f3a721a, 972bf7e, 6791db4; improvements-log giữ CẢ HAI phía conflict; ancestor guards sạch). Audit comment posted.
- [x] 12. Gate CỨNG story-verify — B1 PASS · B2 PASS (plan này) · B3 PASS (code-reviewer verdict) · B4 PASS (dest @ bcc6130) · B5 (Done — set sau gate).
- [x] 13. Linear FI-288 → Done — chỉ sau khi B1–B4 sạch (Linear Done trước merge = INCOMPLETE).

## Evidence

| Step | Commit/Run |
|------|-----------|
| Spec fixes | 8a92d07 (1401 seed), f3a721a (05-d2c gatePhase) |
| tsc prod fixes | 972bf7e (PrintPage + MarkFailModal) |
| Review P2 fixes | 6791db4 |
| Merge | bcc6130 (dest story/qa-hub-store-regression) |
| Reviewer output | /tmp/story/fi-288/code-reviewer-sf-8.md |
