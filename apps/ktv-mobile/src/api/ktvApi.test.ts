// Unit ktvApi (SF-25 T4) — payload shape 2 filter + todayIso timezone.
// (SF-25 T5) — payload shape accept/complete mutations.
// axios singleton được mock ở tầng @hub-store/api-client — capture body POST.
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() =>
  vi.fn(async (): Promise<{ data: unknown }> => ({
    data: {
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
    },
  })),
);

vi.mock("@hub-store/api-client", () => ({
  getAxiosInstance: () => ({ post }),
}));

import {
  acceptOrder,
  completeOrder,
  fetchMyDeliveries,
  fetchMyInstallations,
  todayIso,
} from "./ktvApi";

beforeEach(() => {
  post.mockClear();
});

describe("ktvApi — my-orders filter payloads", () => {
  it("fetchMyInstallations: POST /service-orders/filter — technicianCode + today + page 1/50", async () => {
    await fetchMyInstallations("KTV-001", "2026-09-03");
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(url).toBe("/service-orders/filter");
    expect(body).toEqual({
      technicianCode: "KTV-001",
      dateFrom: "2026-09-03",
      dateTo: "2026-09-03",
      page: 1,
      pageSize: 50,
    });
  });

  it("fetchMyDeliveries: POST /delivery-orders/filter — driverName (không page — BE default)", async () => {
    await fetchMyDeliveries("Nguyễn Văn An", "2026-09-03");
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(url).toBe("/delivery-orders/filter");
    expect(body).toEqual({
      driverName: "Nguyễn Văn An",
      dateFrom: "2026-09-03",
      dateTo: "2026-09-03",
    });
  });

  it("trả items từ PaginationEnvelope (items null-safe → [])", async () => {
    const items = await fetchMyInstallations("KTV-001", "2026-09-03");
    expect(items).toEqual([]);
    post.mockResolvedValueOnce({
      data: {
        items: [
          {
            serviceOrderCode: "SO-0004",
            status: "PROCESSING",
            buttons: {},
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
      },
    });
    const one = await fetchMyInstallations("KTV-001", "2026-09-03");
    expect(one).toHaveLength(1);
    expect(one[0]?.serviceOrderCode).toBe("SO-0004");
  });
});

describe("ktvApi — accept/complete mutations (T5)", () => {
  it("acceptOrder: POST /service-orders/SO-0006/accept body {technicianCode} → trả order", async () => {
    const updated = { serviceOrderCode: "SO-0006", status: "PROCESSING" };
    post.mockResolvedValueOnce({ data: { order: updated } });
    const out = await acceptOrder("SO-0006", "KTV-001");
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(url).toBe("/service-orders/SO-0006/accept");
    expect(body).toEqual({ technicianCode: "KTV-001" });
    expect(out).toEqual(updated);
  });

  it("completeOrder: POST /service-orders/SO-0006/complete body {technicianCode} → trả order", async () => {
    const updated = { serviceOrderCode: "SO-0006", status: "DELIVERED" };
    post.mockResolvedValueOnce({ data: { order: updated } });
    const out = await completeOrder("SO-0006", "KTV-001");
    const [url, body] = post.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(url).toBe("/service-orders/SO-0006/complete");
    expect(body).toEqual({ technicianCode: "KTV-001" });
    expect(out).toEqual(updated);
  });

  it("response.order null → throw (không âm thầm bỏ qua cập nhật)", async () => {
    post.mockResolvedValueOnce({ data: { order: null } });
    await expect(acceptOrder("SO-XXXX", "KTV-001")).rejects.toThrow();
  });
});

describe("todayIso — Asia/Ho_Chi_Minh YYYY-MM-DD", () => {
  it("18:30Z hôm trước (UTC) = 01:30 +07 ngày SAU → ngày +07", () => {
    expect(todayIso(new Date("2026-09-02T18:30:00Z"))).toBe("2026-09-03");
  });
  it("17:00Z = 00:00 +07 cùng ngày đó (VN bắt đầu mới trước UTC)", () => {
    expect(todayIso(new Date("2026-09-02T17:00:00Z"))).toBe("2026-09-03");
  });
  it("giữa ngày VN → cùng ngày", () => {
    expect(todayIso(new Date("2026-09-03T04:00:00Z"))).toBe("2026-09-03");
  });
});
