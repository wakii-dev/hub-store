/**
 * Unit tests — batchingHelpers (SF-8): filter payload "Thêm đơn" + error
 * mapping envelope details[] → message list (error UX Task 9).
 */
import { describe, expect, it } from "vitest";
import { buildAddOrderFilterRequest, extractRejectMessages } from "./batchingHelpers";

describe("buildAddOrderFilterRequest", () => {
  it("chỉ lấy đơn cùng kho + batchStatus=0 + exclude các đơn đã có", () => {
    const req = buildAddOrderFilterRequest("30201", ["ORD-3001", "ORD-3002"]);
    expect(req.shopCodes).toEqual(["30201"]);
    expect(req.batchStatus).toEqual([0]);
    expect(req.excludeFulfillCodes).toEqual(["ORD-3001", "ORD-3002"]);
    expect(req.fulfillCode).toBeUndefined();
  });

  it("searchText trim → filter fulfillCode; text rỗng → undefined", () => {
    expect(buildAddOrderFilterRequest("30201", [], "  ORD-77 ").fulfillCode).toBe("ORD-77");
    expect(buildAddOrderFilterRequest("30201", [], "   ").fulfillCode).toBeUndefined();
  });
});

describe("extractRejectMessages", () => {
  const fallback = "Tạo phiếu thất bại";

  it("lấy messages từ error envelope details[] (gRPC 422 qua BFF)", () => {
    const msgs = extractRejectMessages(
      {
        status: 422,
        data: {
          statusCode: 422,
          message: "Validation failed.",
          details: [
            { field: "orders", message: "Đơn ORD-1 không cùng kho" },
            { field: "orders", message: "Đơn ORD-2 đã có phiếu" },
          ],
        },
      },
      fallback,
    );
    expect(msgs).toEqual(["Đơn ORD-1 không cùng kho", "Đơn ORD-2 đã có phiếu"]);
  });

  it("details rỗng → fallback message envelope", () => {
    const msgs = extractRejectMessages(
      { status: 500, data: { statusCode: 500, message: "INTERNAL", details: [] } },
      fallback,
    );
    expect(msgs).toEqual(["INTERNAL"]);
  });

  it("data là string (network) → dùng string đó", () => {
    expect(extractRejectMessages({ status: "FETCH_ERROR", data: "Network Error" }, fallback)).toEqual([
      "Network Error",
    ]);
  });

  it("error undefined / shape lạ → fallback", () => {
    expect(extractRejectMessages(undefined, fallback)).toEqual([fallback]);
    expect(extractRejectMessages({ status: 500, data: null }, fallback)).toEqual([fallback]);
  });
});
