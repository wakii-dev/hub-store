/**
 * SF-12 (FI-257) — dev credentials cho e2e, thay literal `Password123!` rải rác.
 * Password khớp realm JSON (docker/keycloak/hubstore-realm.json) — 6 users
 * e2e dùng chung 1 dev password (coordinator/warehouse/manager/admin/
 * warehouse-emp/KTV-001); CTV-001 có password riêng (không qua path này).
 * Rotate đồng bộ 3 nơi: realm JSON + file này + README "Secrets & rotation
 * runbook" — ĐỪNG đổi 1 nơi.
 */
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "gY0pM9SO7QEmqil_lWHQ";
