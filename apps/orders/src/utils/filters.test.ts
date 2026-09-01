import { describe, expect, it } from "vitest";
import moment from "moment";
import { buildFilterRequest, bulkActionsState, FILTER_URL_DEFAULTS } from "./filters";
import { toIsoDateBoundary, toIsoDatetime } from "./datetime";

describe("buildFilterRequest", () => {
  it("state rỗng → chỉ page/pageSize (mọi field filter omitted)", () => {
    const req = buildFilterRequest(FILTER_URL_DEFAULTS);
    expect(req.fulfillCode).toBeUndefined();
    expect(req.batchStatus).toBeUndefined();
    expect(req.orderStatus).toBeUndefined();
    expect(req.shopCodes).toBeUndefined();
    expect(req.regionCodes).toBeUndefined();
    expect(req.deliveryTime).toBeUndefined();
    expect(req.createdAt).toBeUndefined();
    expect(req.originalTime).toBeUndefined();
    expect(req.page).toBe(1);
    expect(req.pageSize).toBe(10);
  });

  it("fulfillCode trim + rỗng → omit", () => {
    expect(buildFilterRequest({ ...FILTER_URL_DEFAULTS, fulfillCode: "  " }).fulfillCode).toBeUndefined();
    expect(buildFilterRequest({ ...FILTER_URL_DEFAULTS, fulfillCode: " ORD-1 " }).fulfillCode).toBe("ORD-1");
  });

  it("multi-select string[] → number[] (batchStatus/orderStatus)", () => {
    const req = buildFilterRequest({ ...FILTER_URL_DEFAULTS, batchStatus: ["0", "1"] });
    expect(req.batchStatus).toEqual([0, 1]);
    const req2 = buildFilterRequest({ ...FILTER_URL_DEFAULTS, orderStatus: ["2"] });
    expect(req2.orderStatus).toEqual([2]);
  });

  it("datetime range → ISO-8601 offset (Java parse OffsetDateTime — KHÔNG nhận 'YYYY-MM-DD HH:mm')", () => {
    const req = buildFilterRequest({
      ...FILTER_URL_DEFAULTS,
      deliveryFrom: "2026-09-03 08:00",
      deliveryTo: "2026-09-03 12:00",
    });
    expect(req.deliveryTime?.from).toBe(moment("2026-09-03 08:00", "YYYY-MM-DD HH:mm").toISOString());
    expect(req.deliveryTime?.to).toBe(moment("2026-09-03 12:00", "YYYY-MM-DD HH:mm").toISOString());
    // ISO có offset ('Z') — OffsetDateTime.parse chấp nhận.
    expect(req.deliveryTime?.from).toMatch(/Z$/);
  });

  it("date range (createdAt) → from = đầu ngày, to = cuối ngày", () => {
    const req = buildFilterRequest({
      ...FILTER_URL_DEFAULTS,
      createdFrom: "2026-09-03",
      createdTo: "2026-09-04",
    });
    expect(req.createdAt?.from).toBe(moment("2026-09-03", "YYYY-MM-DD").startOf("day").toISOString());
    expect(req.createdAt?.to).toBe(moment("2026-09-04", "YYYY-MM-DD").endOf("day").toISOString());
  });

  it("range thiếu 1 biên → undefined (không gửi nửa range)", () => {
    const req = buildFilterRequest({
      ...FILTER_URL_DEFAULTS,
      deliveryFrom: "2026-09-03 08:00",
      originalFrom: "2026-09-03 08:00",
      createdFrom: "2026-09-03",
    });
    expect(req.deliveryTime).toBeUndefined();
    expect(req.originalTime).toBeUndefined();
    expect(req.createdAt).toBeUndefined();
  });

  it("page/pageSize clamp tối thiểu 1", () => {
    const req = buildFilterRequest({ ...FILTER_URL_DEFAULTS, page: "0", pageSize: "-5" });
    expect(req.page).toBe(1);
    expect(req.pageSize).toBe(1);
  });
});

describe("toIsoDatetime", () => {
  it("convert 'YYYY-MM-DD HH:mm' và 'YYYY-MM-DD'", () => {
    expect(toIsoDatetime("2026-09-03 08:30")).toBe(moment("2026-09-03 08:30", "YYYY-MM-DD HH:mm").toISOString());
    expect(toIsoDatetime("2026-09-03")).toBe(moment("2026-09-03", "YYYY-MM-DD").toISOString());
  });
  it("rỗng / sai format → undefined", () => {
    expect(toIsoDatetime("")).toBeUndefined();
    expect(toIsoDatetime(undefined)).toBeUndefined();
    expect(toIsoDatetime("không phải ngày")).toBeUndefined();
  });
});

describe("toIsoDateBoundary", () => {
  it("from = startOf day, to = endOf day", () => {
    expect(toIsoDateBoundary("2026-09-03", "from")).toBe(
      moment("2026-09-03", "YYYY-MM-DD").startOf("day").toISOString(),
    );
    expect(toIsoDateBoundary("2026-09-03", "to")).toBe(
      moment("2026-09-03", "YYYY-MM-DD").endOf("day").toISOString(),
    );
    expect(toIsoDateBoundary(undefined, "from")).toBeUndefined();
  });
});

describe("bulkActionsState — enable/disable bulk bar theo selection", () => {
  it("0 row → cả hai disable", () => {
    expect(bulkActionsState(0, true)).toEqual({ canCreateBatch: false, canTransfer: false });
  });
  it("1 row cùng kho → Tạo phiếu enable + Chuyển kho enable", () => {
    expect(bulkActionsState(1, true)).toEqual({ canCreateBatch: true, canTransfer: true });
  });
  it("N>1 row CÙNG kho → Tạo phiếu enable + Chuyển kho disable (≠1 row)", () => {
    expect(bulkActionsState(3, true)).toEqual({ canCreateBatch: true, canTransfer: false });
  });
  it("N>1 row KHÁC kho → cả hai disable (Tạo phiếu cần cùng kho)", () => {
    expect(bulkActionsState(2, false)).toEqual({ canCreateBatch: false, canTransfer: false });
  });
});
