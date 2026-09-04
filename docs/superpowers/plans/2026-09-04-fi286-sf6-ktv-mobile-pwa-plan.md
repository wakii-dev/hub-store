# FI-286 SF-6 — KTV Mobile + PWA sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QA sweep KTV mobile + PWA theo specs 08-mobile/09-ktv-mobile/08-pwa qua browser thật :375, fix P0–P2, regression 14xx, verify-no-regression.

**Architecture:** 2 seam private-port chạy TUẦN TỰ (collision 52073–52076 giữa block sf-4 shell và sf-25 ktv): Seam A shell-stack (pattern `scripts/run-sf4-private.sh`) cho 08-mobile + 08-pwa; Seam B ktv (`e2e/scripts/run-ktv-private.sh`) cho 09-ktv-mobile + offline/SW. Rule 0 3 tầng (DOM→VISUAL→FLOW) cho mọi walkthrough.

**Tech Stack:** Playwright (offline qua `context.setOffline()`), vite dev servers, docker postgres/keycloak riêng, SW hand-rolled (`apps/ktv-mobile/public/sw.js`).

**Linear Issue:** FI-286

**Boundary:** CẤM sửa `usePermissions.tsx`/nav config (SF-2)/`sf11-helpers.ts`; KHÔNG feature mới; bug perm → `[PERM]` FI-282; >8 bug P2 → STOP.

---

### Task 1: Boot Seam A (shell) + baseline 08-mobile + 08-pwa + walkthrough :375

**Files:** read-only infra; screenshots → `/tmp/story/fi280-sf6/shots/`

- [ ] **Step 1: Boot Seam A + mint auth**

```bash
KEEP_STACK=1 nohup bash scripts/run-sf4-private.sh > /tmp/story/fi280-sf6/seam-a.log 2>&1 &
# chờ: nc -z localhost 4200 4285 8282
# mint auth: probe e2e/scripts/mint_sf11.py usage → mint manager storageState
#   (08-mobile dùng sf11StorageState("manager") — đọc e2e/tests/sf11-helpers.ts (READ-ONLY) để biết env/path)
```

Expected: `[sf4] ready — ... shell:4200 ... kc:8282`.

- [ ] **Step 2: Baseline run specs shell-domain (không fix trước — sweep)**

```bash
cd e2e && E2E_SHELL_URL=http://localhost:4200 E2E_BFF_URL=http://localhost:4285 \
  E2E_REUSE=1 E2E_PG_SEAM=1 E2E_PG_SHIM=/tmp/story/fi280-sf4/shim \
  pnpm exec playwright test 08-mobile 08-pwa --reporter=line
```

Expected: PASS hoặc FAIL = bug candidate (KHÔNG fix ngay — log vào bug ledger trước).

- [ ] **Step 3: Walkthrough Rule 0 :375 (08-mobile + 08-pwa flows)**
  Browser thật (orca browser / playwright script riêng): login manager → :375 viewport → hamburger nav mở/đóng → D1 table scroll → logout. 08-pwa: manifest fetch → SW controller → offline.html → notifications 401/200. Screenshot mỗi màn → `/tmp/story/fi280-sf6/shots/`. KHÔNG curl bare `/src/*.ts`; hard-reload mỗi sweep.
- [ ] **Step 4: Bug ledger + commit docs nếu có flag improvements**

### Task 2: Kill Seam A → Boot Seam B (ktv) + baseline 09-ktv-mobile + walkthrough :375

**Files:** read-only infra `e2e/scripts/run-ktv-private.sh`

- [ ] **Step 1: Kill block Seam A (chỉ process của mình — skip docker)**

```bash
for p in 4200 4201 4202 4285 52071 52072 52073 52074 52075 52076; do
  lsof -ti tcp:$p 2>/dev/null | while read pid; do
    ps -p $pid -o command= | grep -qE 'docker|com\.docker' || kill -9 $pid
  done
done
# containers sf4-* GIỮ (không share với seam B) — hoặc docker rm -f nếu muốn sạch
```

- [ ] **Step 2: Boot Seam B**

```bash
nohup bash e2e/scripts/run-ktv-private.sh > /tmp/story/fi280-sf6/seam-b.log 2>&1 &
# chờ: app :4220 bff :4286 kc :8082 pg :56443; runner tự mint e2e/.auth/ktv-001.json + ctv-001.json
```

Expected: `[sf-25] seam ready — pg:56443 keycloak:8082 java:52073 go:52074 bff:4286 app:4220`.

- [ ] **Step 3: Baseline run 09-ktv-mobile**

```bash
cd e2e && pnpm exec playwright test -c playwright.ktv.config.ts 09-ktv-mobile --reporter=line
```

- [ ] **Step 4: Walkthrough Rule 0 :375 KTV app**: login KTV-001 qua UI thật (KHÔNG bypass storageState cho walkthrough) → My Orders đúng đơn mình → tab Giao hàng → accept SO-0006 → complete SO-0006 → reschedule SO-0004 → detail timeline/tel/map → logout → back-button không vào lại. Screenshot từng màn.
- [ ] **Step 5: CTV-001 isolation check** (S7): login CTV-001 → chỉ thấy SO-0007.

### Task 3: PWA offline + SW cache hygiene (ktv app)

**Files:** kiểm `apps/ktv-mobile/public/sw.js`, `src/lib/pwa.ts` (sửa chỉ khi bug P0–P2)

- [ ] **Step 1: Script Playwright offline** (tự viết tại `/tmp/story/fi280-sf6/offline-check.spec.ts`, KHÔNG sửa sf11-helpers): goto `/` → chờ `navigator.serviceWorker.controller !== null` → load My Orders (cache nav) → `context.setOffline(true)` → reload → expect offline.html fallback + job list từ cache nav (nếu cached); `/api/` call offline → fail KHÔNG serve stale.
- [ ] **Step 2: Cache hygiene asserts**: `/api/` pass-through (guard 3); non-GET pass-through; cross-origin pass-through; OIDC callback URL không pin cache (guard P2-1); immutable `/assets/` cache-first; nav network-first.
- [ ] **Step 3: Hard-reload sweep**: mỗi lần fix xong SW → hard-reload + unregister SW + clear caches trước sweep kế (cache cũ che bug).
- [ ] **Step 4: Screenshot evidence offline state** → `/tmp/story/fi280-sf6/shots/offline-*.png`.

### Task 4: PWA install prompt — manual checklist + screenshot evidence

- [ ] **Step 1: Checklist automate được**: manifest 200 (name `HubStore KTV`, icons ≥2 đúng size 192/512, theme_color, display standalone, start_url `/`); SW active + `fetch` handler (installability yêu cầu); HTTPS/localhost context.
- [ ] **Step 2: Manual checklist + screenshot**: `beforeinstallprompt` event presence qua `page.evaluate` (Chromium desktop/Mobile emulation); document không-click-được-native-prompt → checklist file `/tmp/story/fi280-sf6/pwa-install-manual.md` + screenshot icon/splash/manifest. Evidence comment lên FI-286.
- [ ] **Step 3: Lỗi installability (manifest sai field, SW không đủ điều kiện) = bug P1** → fix trong apps/ktv-mobile.

### Task 5: Fix found bugs P0–P2

**Files:** `apps/ktv-mobile/**` + `apps/ktv-mobile/public/sw.js` (SW version bump nếu sửa); unit tests kèm nếu có pattern (`*.test.tsx`)

- [ ] Mỗi bug: fix tối thiểu → unit/vitest nếu surface có → commit riêng `fix(ktv): <bug>` → bug-log comment `[P<n>][MOBILE] <title> / repro / expected vs actual / evidence / fix commit / regression spec` lên FI-286. P3/latency chỉ log ledger. >8 bug P2 → STOP escalate.
- [ ] Sau mỗi fix SW: bump `CACHE` version (`ktv-mobile-v1` → `v2`).

### Task 6: Regression spec 14xx + verify-no-regression

**Files:** Create `e2e/tests/1401-ktv-mobile-regression.spec.ts` (dưới playwright.ktv.config glob), KHÔNG import sf11-helpers

- [x] **Step 1: Viết spec tự lập state** (seed tech-sample từ runner là state gốc; mutation serial trong spec): S1 SW offline fallback offline.html; S2 `/api/` offline fail-không-stale; S3 :375 accept→complete flow; S4 cache version bump hoạt động; S5 CTV isolation.
- [x] **Step 2: Run** `pnpm exec playwright test -c playwright.ktv.config.ts 1401 --reporter=line` → PASS.
- [x] **Step 3: verify-no-regression**: re-run `09-ktv-mobile` (và `08-mobile`+`08-pwa` trên Seam A nếu fix đụng shell-domain) → PASS.

### Task 7: Review + Rule 0 final + merge + gate + Done

- [ ] **Step 1: code-reviewer độc lập** trên `git diff story/qa-hub-store-regression..HEAD` (fix commits + 14xx spec + docs). CHANGES-REQUESTED → fix trước merge.
- [x] **Step 2: Rule 0 final**: walkthrough trọn login→navigate→action→logout trên bản fix, hard-reload, screenshot before/after.
- [ ] **Step 3: Merge no-ff** vào `story/qa-hub-store-regression` (conflict improvements-log giữ CẢ HAI) + audit comment merge-hash lên FI-286.
- [ ] **Step 4: Gate:** `~/.claude/bin/story-verify sf-6` sạch.
- [ ] **Step 5: FI-286 → Done** (SAU gate). Audit Phase 5 comment.
