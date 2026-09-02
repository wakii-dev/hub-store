import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosRequestConfig } from "axios";
import type { AxiosInstance } from "axios";
import { getAxiosInstance } from "@hub-store/api-client";
import { api } from "@hub-store/api-client";
import { createAppStore } from "@hub-store/api-client";
import "./batchesApi";

/**
 * Review fix (P1 reviewer-sf9): BatchListPage.test mock HOÀN endpoint layer —
 * slice này chạy THẬT qua store + axios adapter stub, assert URL/method/body
 * + invalidation (providesTags/invalidatesTags Batches LIST) đúng contract BFF.
 */

type Captured = { url: string; method: string; data: unknown };

const ENVELOPE = { items: [], total: 0, page: 1, pageSize: 10 };

function installAdapter() {
  const instance: AxiosInstance = getAxiosInstance();
  const captured: Captured[] = [];
  instance.defaults.adapter = async (config: AxiosRequestConfig) => {
    captured.push({
      url: config.url ?? "",
      method: (config.method ?? "get").toLowerCase(),
      data: config.data,
    });
    return {
      data: ENVELOPE,
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };
  return captured;
}

describe("batchesApi slice (real store + stubbed axios adapter)", () => {
  let captured: Captured[];

  beforeEach(() => {
    captured = installAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("filterBatches — POST /fulfillment/batches/filter với body pagination", async () => {
    const store = createAppStore();
    await store.dispatch(
      api.endpoints.filterBatches.initiate({ page: 2, pageSize: 20, searchText: "BATCH-1" }),
    );
    const req = captured.find((c) => c.url.includes("/fulfillment/batches/filter"));
    expect(req).toBeDefined();
    expect(req!.method).toBe("post");
    expect(JSON.parse(String(req!.data))).toEqual({
      page: 2,
      pageSize: 20,
      searchText: "BATCH-1",
    });
  });

  it("getBatchCriteria — GET /fulfillment/batches/criteria", async () => {
    const store = createAppStore();
    await store.dispatch(api.endpoints.getBatchCriteria.initiate());
    const req = captured.find((c) => c.url.includes("/fulfillment/batches/criteria"));
    expect(req).toBeDefined();
    expect(req!.method).toBe("get");
  });

  it("cancelBatch — PUT /fulfillment/batches/:code/cancel với {reason}", async () => {
    const store = createAppStore();
    await store.dispatch(
      api.endpoints.cancelBatch.initiate({ code: "BATCH 9", reason: "Sai thông tin" }),
    );
    const req = captured.find((c) => c.url.includes("/cancel"));
    expect(req).toBeDefined();
    // encodeURIComponent contract — batchCode có space vẫn encode an toàn.
    expect(req!.url).toBe("/fulfillment/batches/BATCH%209/cancel");
    expect(req!.method).toBe("put");
    expect(JSON.parse(String(req!.data))).toEqual({ reason: "Sai thông tin" });
  });

  it("completePicking — PUT /fulfillment/complete-picking với {batchCode}", async () => {
    const store = createAppStore();
    await store.dispatch(api.endpoints.completePicking.initiate({ batchCode: "BATCH-0001" }));
    const req = captured.find((c) => c.url.includes("/fulfillment/complete-picking"));
    expect(req).toBeDefined();
    expect(req!.method).toBe("put");
    expect(JSON.parse(String(req!.data))).toEqual({ batchCode: "BATCH-0001" });
  });

  it("invalidation — cancelBatch refetch filterBatches (invalidatesTags Batches LIST)", async () => {
    vi.useFakeTimers();
    const store = createAppStore();
    // Subscription giữ cache entry LIST sống (providesTags của filterBatches).
    const sub = store.dispatch(
      api.endpoints.filterBatches.initiate({ page: 1, pageSize: 10 }),
    );
    await vi.advanceTimersByTimeAsync(0);
    const filterCallsBefore = captured.filter((c) => c.url.includes("/batches/filter")).length;
    expect(filterCallsBefore).toBe(1);

    await store.dispatch(
      api.endpoints.cancelBatch.initiate({ code: "BATCH-0001", reason: "x" }),
    );
    await vi.advanceTimersByTimeAsync(10);

    // Mutation PUT + refetch filter vì LIST bị invalidate.
    expect(captured.some((c) => c.method === "put" && c.url.includes("/cancel"))).toBe(true);
    expect(captured.filter((c) => c.url.includes("/batches/filter")).length).toBe(
      filterCallsBefore + 1,
    );
    sub.unsubscribe();
  });
});
