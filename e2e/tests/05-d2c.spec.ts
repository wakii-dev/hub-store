import fs from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * SF-18 Task 7 — E2E D2C / Dropship (FI-263) — role WarehouseEmployee
 * (storageState .auth/warehouse-emp.json — auth.setup login thật Keycloak;
 * landing path của role này là /hub-store-order/d2c theo firstPathForRole).
 * Phủ spec §3.4: (a) nav + bảng; (b) filter carrier + khung giờ đẩy;
 * (c) expand row (push/export + người nhận + tách nợ + service type);
 * (d) note modal ghi chú tiếng Việt; (e) export guard >31 ngày + CSV BOM;
 * (f) coordinator KHÔNG thấy nav D2C + route trực tiếp bị chặn.
 * Seed: api/seed/d2c-sample.json — 12 đơn (GHN/GHTK/ViettelPost).
 */

test.describe("WarehouseEmployee — D2C / Dropship", () => {
  test.use({ storageState: ".auth/warehouse-emp.json" });

  test("(a) vào D2C thấy bảng + 12 đơn seed", async ({ page }) => {
    await page.goto("/hub-store-order/d2c");
    await expect(page.getByTestId("d2c-page")).toBeVisible();
    await expect(page.getByTestId("d2c-table")).toBeVisible();
    await expect(page.getByText("Tổng 12 đơn")).toBeVisible();
    await expect(page.locator(".ant-table-tbody tr.ant-table-row")).toHaveCount(10); // page size 10
    await expect(page.getByTestId("d2c-order-code-D2C-2001")).toBeVisible();
  });

  test("(b) filter Hãng vận chuyển GHN + khung giờ đẩy 08:00-09:00 → đúng 1 đơn D2C-2001", async ({
    page,
  }) => {
    await page.goto("/hub-store-order/d2c");
    await expect(page.getByTestId("d2c-table")).toBeVisible();

    // MultiSelect carrier — chọn GHN
    await page.locator(".ant-select").filter({ hasText: "Hãng vận chuyển" }).click();
    await page
      .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
      .filter({ hasText: "GHN" })
      .first()
      .click();
    await page.keyboard.press("Escape");

    // TimeRange khung giờ đẩy — 2 input placeholder "Khung giờ đẩy".
    // SF-3 (FI-283): rc-picker 2.x đặt readOnly=!typing trên input — fill()
    // từ chối input readonly. Tương tác như user thật: click → gõ → Enter
    // (keydown đầu mở khóa typing state → input nhận chữ).
    const slot = page.getByPlaceholder("Khung giờ đẩy");
    await slot.nth(0).click();
    await slot.nth(0).pressSequentially("08:00");
    await slot.nth(0).press("Enter");
    await slot.nth(1).click();
    await slot.nth(1).pressSequentially("09:00");
    await slot.nth(1).press("Enter");

    await page.getByRole("button", { name: "Tìm kiếm" }).click();

    // Seed: GHN 4 đơn nhưng pushTime trong [08:00, 09:00] chỉ D2C-2001 (08:30)
    await expect(page.getByText("Tổng 1 đơn")).toBeVisible();
    await expect(page.locator(".ant-table-tbody tr.ant-table-row")).toHaveCount(1);
    await expect(page.getByTestId("d2c-order-code-D2C-2001")).toBeVisible();
  });

  test("(c) expand D2C-2004 → push/export + người nhận + tách nợ + service type", async ({
    page,
  }) => {
    await page.goto("/hub-store-order/d2c");
    await page.locator('[data-row-key="D2C-2004"]').getByText("Chi tiết").click();

    const expand = page.getByTestId("d2c-expand-D2C-2004");
    await expect(expand).toBeVisible();
    // Push info + export info
    await expect(expand.getByTestId("d2c-push-time-D2C-2004")).toHaveText(/2026-08-03 20:10/);
    await expect(expand).toContainText("Trần Thị Mai"); // NV xuất
    await expect(expand).toContainText("2026-08-04 09:00"); // thời gian xuất
    // Người nhận + tách nợ + service type
    await expect(expand).toContainText("Ngô Thị Hồng");
    await expect(expand.getByTestId("d2c-debt-splitting-D2C-2004")).toHaveText("Có");
    await expect(expand).toContainText("Giao tiết kiệm");
  });

  test("(d) note modal: ghi chú tiếng Việt → lưu → mở lại thấy ghi chú", async ({ page }) => {
    const note = "Khách yêu cầu giao buổi tối, gọi trước 30 phút cho anh Dũng.";
    await page.goto("/hub-store-order/d2c");
    await expect(page.getByTestId("d2c-table")).toBeVisible();

    await page.getByTestId("d2c-row-note-D2C-2003").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("D2C-2003");
    await page.getByTestId("d2c-note-input").fill(note);
    await page.getByTestId("d2c-note-save").click();
    await expect(page.getByText("Đã lưu ghi chú")).toBeVisible();

    // Mở lại modal → ghi chú đã persist (PUT + list refetch)
    await page.getByTestId("d2c-row-note-D2C-2003").click();
    await expect(page.getByTestId("d2c-note-input")).toHaveValue(note);
    await page.getByTestId("d2c-note-cancel").click();

    // Expand row cũng hiển thị note + tag "Có ghi chú"
    await page.locator('[data-row-key="D2C-2003"]').getByText("Chi tiết").click();
    await expect(page.getByTestId("d2c-expand-D2C-2003")).toContainText(note);
  });

  test("(e) export 40 ngày bị chặn; 31 ngày tải CSV BOM UTF-8", async ({ page }) => {
    await page.goto("/hub-store-order/d2c");
    await expect(page.getByTestId("d2c-export")).toBeVisible();

    // 40 ngày (2026-06-01 → 2026-07-11) → client guard chặn, KHÔNG download
    // (SF-3: click + gõ thay fill() — rc-picker 2.x readOnly=!typing, xem test (b))
    let downloaded: string | null = null;
    // SF-8 convergence: handler chỉ cancel trong phase 40-ngày-gate — để
    // registered vô hạn thì nó cancel nhầm download THẬT ở phase 2
    // (race path() vs cancel() → "download.path: canceled" khi máy load cao).
    let gatePhase = true;
    page.on("download", (d) => {
      if (!gatePhase) return;
      downloaded = d.suggestedFilename();
      void d.cancel();
    });
    const fromDate = page.getByPlaceholder("Từ ngày");
    const toDate = page.getByPlaceholder("Đến ngày");
    await fromDate.click();
    await fromDate.pressSequentially("2026-06-01");
    await fromDate.press("Enter");
    await toDate.click();
    await toDate.pressSequentially("2026-07-11");
    await toDate.press("Enter");
    await expect(page.getByTestId("d2c-export-button")).toBeEnabled();
    await page.getByTestId("d2c-export-button").click();
    await expect(page.getByText("Khoảng thời gian export tối đa 31 ngày")).toBeVisible();
    expect(downloaded).toBeNull();

    // 31 ngày (2026-07-01 → 2026-08-01) → download event + CSV BOM + header.
    // Reload trước — gõ đè lên range đã có giá trị không đáng tin (rc-picker
    // không replace text cũ khi panel mở lần 2); user reload/fetch form mới.
    await page.reload();
    gatePhase = false; // phase 2 — download thật, KHÔNG cancel
    await expect(page.getByTestId("d2c-export")).toBeVisible();
    const fromDate2 = page.getByPlaceholder("Từ ngày");
    const toDate2 = page.getByPlaceholder("Đến ngày");
    const downloadPromise = page.waitForEvent("download");
    await fromDate2.click();
    await fromDate2.pressSequentially("2026-07-01");
    await fromDate2.press("Enter");
    await toDate2.click();
    await toDate2.pressSequentially("2026-08-01");
    await toDate2.press("Enter");
    await page.getByTestId("d2c-export-button").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("D2C_Order_2026-07-01_2026-08-01.csv");
    // SF-3: bản Playwright của repo không có Download.createStream() — đọc qua path()
    const buffer = fs.readFileSync(await download.path());
    expect([buffer[0], buffer[1], buffer[2]]).toEqual([0xef, 0xbb, 0xbf]); // BOM EF BB BF
    const text = buffer.toString("utf8");
    expect(text.startsWith("\uFEFFMã đơn,Mã nội bộ,Mã vận đơn,Hãng vận chuyển")).toBe(true);
  });
});

test.describe("Coordinator — không có D2C (role guard FE)", () => {
  test.use({ storageState: ".auth/coordinator.json" });

  test("(f) nav không có D2C + route trực tiếp /d2c bị chặn", async ({ page }) => {
    await page.goto("/hub-store-order/order");
    await expect(page.getByTestId("nav-orders")).toBeVisible();
    await expect(page.getByTestId("nav-d2c")).toHaveCount(0);
    // URL trực tiếp → RequirePermission màn Forbidden (không render D2CPage)
    await page.goto("/hub-store-order/d2c");
    await expect(page.getByTestId("forbidden")).toBeVisible();
    await expect(page.getByTestId("d2c-page")).toHaveCount(0);
  });
});
