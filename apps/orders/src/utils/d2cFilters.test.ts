import { describe, expect, it } from "vitest";
import {
  D2C_FILTER_URL_DEFAULTS,
  buildD2cFilterRequest,
  d2cExportRangeDays,
  isValidD2cExportRange,
} from "./d2cFilters";

describe("buildD2cFilterRequest", () => {
  it("defaults → body rỗng (không filter) + page/pageSize số", () => {
    const body = buildD2cFilterRequest(D2C_FILTER_URL_DEFAULTS);
    expect(body.search).toBeUndefined();
    expect(body.statuses).toBeUndefined();
    expect(body.carriers).toBeUndefined();
    expect(body.shops).toBeUndefined();
    expect(body.productCategory).toBeUndefined();
    expect(body.pushSlotFrom).toBeUndefined();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(10);
  });

  it("datetime range 'YYYY-MM-DD HH:mm' → ISO string cho BFF", () => {
    const body = buildD2cFilterRequest({
      ...D2C_FILTER_URL_DEFAULTS,
      pushFrom: "2026-08-15 08:00",
      pushTo: "2026-08-15 09:00",
    });
    expect(body.pushFrom).toBe("2026-08-15T01:00:00.000Z"); // +07
    expect(body.pushTo).toBe("2026-08-15T02:00:00.000Z");
  });

  it("slot HH:mm passed as-is; multiselect rỗng → omit", () => {
    const body = buildD2cFilterRequest({
      ...D2C_FILTER_URL_DEFAULTS,
      slotFrom: "08:00",
      slotTo: "09:00",
      carriers: [],
      statuses: ["pending", "pushed"],
    });
    expect(body.pushSlotFrom).toBe("08:00");
    expect(body.pushSlotTo).toBe("09:00");
    expect(body.carriers).toBeUndefined();
    expect(body.statuses).toEqual(["pending", "pushed"]);
  });

  it("search trim rỗng → omit", () => {
    const body = buildD2cFilterRequest({ ...D2C_FILTER_URL_DEFAULTS, search: "   " });
    expect(body.search).toBeUndefined();
  });
});

describe("export guard (cùng công thức BFF exportRangeDays)", () => {
  it("31 ngày khoảng cách → OK, 32 → chặn (biên AC 40 chặn / 31 OK)", () => {
    expect(d2cExportRangeDays("2026-08-01", "2026-09-01")).toBe(31);
    expect(isValidD2cExportRange("2026-08-01", "2026-09-01")).toBe(true);
    expect(d2cExportRangeDays("2026-08-01", "2026-09-02")).toBe(32);
    expect(isValidD2cExportRange("2026-08-01", "2026-09-02")).toBe(false);
  });

  it("from > to → chặn; thiếu/định dạng sai → chặn", () => {
    expect(isValidD2cExportRange("2026-09-02", "2026-08-01")).toBe(false);
    expect(isValidD2cExportRange("", "2026-08-01")).toBe(false);
    expect(isValidD2cExportRange("2026-08-01", "not-a-date")).toBe(false);
  });
});
