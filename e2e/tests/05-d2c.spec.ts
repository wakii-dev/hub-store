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

    // TimeRange khung giờ đẩy — 2 input placeholder "Khung giờ đẩy"
    const slot = page.getByPlaceholder("Khung giờ đẩy");
    await slot.nth(0).fill("08:00");
    await slot.nth(1).fill("09:00");
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
    let downloaded: string | null = null;
    page.on("download", (d) => {
      downloaded = d.suggestedFilename();
      void d.cancel();
    });
    await page.getByPlaceholder("Từ ngày").fill("2026-06-01");
    await page.getByPlaceholder("Đến ngày").fill("2026-07-11");
    await page.getByPlaceholder("Đến ngày").press("Enter");
    await expect(page.getByTestId("d2c-export-button")).toBeEnabled();
    await page.getByTestId("d2c-export-button").click();
    await expect(page.getByText("Khoảng thời gian export tối đa 31 ngày")).toBeVisible();
    expect(downloaded).toBeNull();

    // 31 ngày (2026-07-01 → 2026-08-01) → download event + CSV BOM + header
    const downloadPromise = page.waitForEvent("download");
    await page.getByPlaceholder("Từ ngày").fill("2026-07-01");
    await page.getByPlaceholder("Đến ngày").fill("2026-08-01");
    await page.getByPlaceholder("Đến ngày").press("Enter");
    await page.getByTestId("d2c-export-button").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("D2C_Order_2026-07-01_2026-08-01.csv");
    const stream = await download.createStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);
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
