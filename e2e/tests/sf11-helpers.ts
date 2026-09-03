import fs from "node:fs";
import path from "node:path";
import { request as newRequest, type APIRequestContext } from "@playwright/test";

/**
 * SF-11 Task 6 — helpers chung cho 08-*.spec.ts (seam sf-11, FI-256).
 * StorageState per-role mint trước bằng e2e/scripts/mint_sf11.py — spec gán qua
 * test.use({ storageState }) (config KHÔNG set storageState toàn cục).
 */

/** Auth dir mặc định theo runner seam; override bằng E2E_SF11_AUTH_DIR. */
export const SF11_AUTH_DIR = process.env.E2E_SF11_AUTH_DIR ?? "/tmp/story/fi245/sf11";

/** BFF seam (:4085) — 127.0.0.1 tường minh (node 24 resolve localhost → ::1). */
export const SF11_BFF = process.env.E2E_SF11_BFF ?? "http://127.0.0.1:4085";

export type Sf11Role = "manager" | "coordinator" | "admin";

/** Đường dẫn storageState cho role — fail-loud nếu chưa mint. */
export function sf11StorageState(role: Sf11Role): string {
  const file = path.join(SF11_AUTH_DIR, `auth-${role}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Không thấy ${file} — mint trước: python3 e2e/scripts/mint_sf11.py ${role}`,
    );
  }
  return file;
}

/** Access token Keycloak từ storageState (oidc-client-ts lưu localStorage). */
export function readSf11Token(role: Sf11Role = "manager"): string {
  const state = JSON.parse(fs.readFileSync(sf11StorageState(role), "utf8")) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  for (const origin of state.origins ?? []) {
    for (const entry of origin.localStorage ?? []) {
      if (!entry.name.startsWith("oidc.user:")) continue;
      const user = JSON.parse(entry.value) as { access_token?: string };
      if (user.access_token) return user.access_token;
    }
  }
  throw new Error(`Không tìm thấy access_token trong storageState ${role} — mint lại?`);
}

/** API request context gọi BFF seam với Bearer token (pattern 05-nvc-api). */
export async function sf11Api(role: Sf11Role = "manager"): Promise<APIRequestContext> {
  return newRequest.newContext({
    baseURL: SF11_BFF,
    extraHTTPHeaders: { Authorization: `Bearer ${readSf11Token(role)}` },
  });
}
