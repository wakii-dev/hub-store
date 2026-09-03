import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * SF-17 — Khu vực hoạt động NV (spec §9):
 * - Admin (storageState .auth/admin.json): tạo definition (2 tỉnh + verify mock
 *   xanh [MOCK]) → thấy trong list → expand thấy wards → toggle off → row MỜI
 *   + tag ngừng vẫn VISIBLE (không biến mất — list luôn gồm inactive).
 * - Coordinator: KHÔNG thấy nút tạo (UI gate); gọi thẳng POST /service-employees
 *   với token coordinator → 403 envelope FORBIDDEN (server-side gate BFF).
 *
 * Direct API: axios của app gọi thẳng BFF http://localhost:8080 (api-client/
 * baseQuery.ts — KHÔNG qua shell proxy). Token lấy từ storageState localStorage
 * (oidc-client-ts persist user ở key `oidc.user:<authority>:<client_id>`).
 * Mã NV ngẫu nhiên theo run — DB dev persist giữa các run (unique employee_code).
 */

test.describe("Admin — tạo + quản lý khu vực hoạt động NV", () => {
  test.use({ storageState: ".auth/admin.json" });

  test("tạo (2 tỉnh, verify [MOCK]) → list → expand wards → toggle off vẫn thấy", async ({
    page,
  }) => {
    const CODE = `NV-E2E-${Math.floor(Math.random() * 90000) + 10000}`;

    await page.goto("/area-staff");
    await expect(page.getByTestId("area-list")).toBeVisible();
    await page.getByTestId("area-create-btn").click();
    await expect(page).toHaveURL(/\/area-staff\/new$/);
    await expect(page.getByTestId("area-form")).toBeVisible();

    // Chức danh (Select tĩnh)
    await page.getByTestId("area-form-title-code").click();
    await page.locator(".ant-select-item-option", { hasText: "Shipper" }).click();

    // NV
    await page.getByTestId("area-form-employee-code").fill(CODE);
    await page.getByTestId("area-form-full-name").fill("Nguyễn E2E Khu Vực");

    // TK nhận tiền + verify dual-mode mock → badge [MOCK] + valid
    await page.getByTestId("area-form-payment-account").fill("1234567890");
    await page.getByTestId("area-verify-btn").click();
    await expect(page.getByTestId("area-verify-result")).toContainText("[MOCK]");
    await expect(page.getByTestId("area-verify-result")).toContainText("Tài khoản hợp lệ");

    // MỘT TreeSelect (treeCheckStrictly) — check 2 node TỈNH = phụ trách toàn tỉnh
    await page.getByTestId("area-form-regions").click();
    for (const province of ["T. Thừa Thiên Huế", "Quảng Nam"]) {
      await page
        .locator(".ant-select-tree-treenode", { hasText: province })
        .locator(".ant-select-tree-checkbox")
        .click();
    }
    await page.keyboard.press("Escape");
    await page.getByTestId("area-form-submit").click();

    await expect(page).toHaveURL(/\/area-staff$/);
    const row = page.getByTestId(`area-row-${CODE}`);
    await expect(row).toBeVisible();

    // Expand row → wards resolve theo tỉnh
    await page.getByTestId(`area-expand-${CODE}`).click();
    const wards = page.getByTestId(`area-wards-${CODE}`);
    await expect(wards).toBeVisible();
    await expect(wards).toContainText("T. Thừa Thiên Huế");
    await expect(wards).toContainText("Quảng Nam");

    // Toggle off → row vẫn thấy (dim opacity 0.45) + tag "Ngừng hoạt động"
    await page.getByTestId(`area-active-toggle-${CODE}`).click();
    await expect(row).toHaveCSS("opacity", "0.45");
    await expect(row.getByTestId("area-inactive-tag")).toBeVisible();
  });
});

test.describe("Coordinator — view-only (không nút tạo + API 403)", () => {
  test.use({ storageState: ".auth/coordinator.json" });

  test("không thấy area-create-btn; POST /service-employees trực tiếp → 403 FORBIDDEN", async ({
    page,
    request,
  }) => {
    await page.goto("/area-staff");
    await expect(page.getByTestId("area-list")).toBeVisible();
    await expect(page.getByTestId("area-create-btn")).toHaveCount(0);

    // Token từ storageState localStorage (oidc-client-ts user JSON có access_token).
    const statePath = path.join(__dirname, "..", ".auth", "coordinator.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    const oidcEntry = (state.origins ?? []).flatMap(
      (o: { localStorage?: Array<{ name: string; value: string }> }) => o.localStorage ?? [],
    ).find((e: { name: string }) => e.name.startsWith("oidc.user:"));
    expect(oidcEntry, "storageState thiếu oidc user localStorage").toBeTruthy();
    const token = JSON.parse(oidcEntry.value).access_token;
    expect(typeof token).toBe("string");

    const res = await request.post(`${process.env.E2E_BFF_URL ?? "http://localhost:8080"}/service-employees`, {
      data: {
        employeeCode: "NV-403",
        fullName: "Coordinator Bị Chặn",
        titleCode: "SHIPPER",
        paymentAccount: "1234567890",
      },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });
});
