import { describe, expect, it } from "vitest";
import type { AxiosRequestConfig } from "axios";
import type { AxiosInstance } from "axios";
import { getAxiosInstance } from "@hub-store/api-client";
import { api } from "@hub-store/api-client";
import { createAppStore } from "@hub-store/api-client";
import { printDocument } from "./printApi";
import "./printApi";

/**
 * SF-10 slice tests — real store + axios adapter stub (pattern batchesApi.test
 * của SF-9): assert URL/method/body khớp contract BFF (print.ts routes) +
 * blob→bytes của printDocument (PDF bytes KHÔNG envelope, spec §3.7).
 */

type Captured = { url: string; method: string; data: unknown; params: unknown; responseType?: string };

const PRINTERS = {
  items: [
    { printerId: "PTR-30201-01", name: "Máy in kho 30201", shopCode: "30201", location: "Tầng 2" },
  ],
};

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"

function installAdapter(
  respond: (config: AxiosRequestConfig) => { status: number; data: unknown },
) {
  const instance: AxiosInstance = getAxiosInstance();
  const captured: Captured[] = [];
  instance.defaults.adapter = async (config: AxiosRequestConfig) => {
    captured.push({
      url: config.url ?? "",
      method: (config.method ?? "get").toLowerCase(),
      data: config.data,
      params: config.params,
      responseType: config.responseType,
    });
    const { status, data } = respond(config);
    return { data, status, statusText: status === 200 ? "OK" : "BAD", headers: {}, config };
  };
  return captured;
}

describe("printApi slice (real store + stubbed axios adapter)", () => {
  let captured: Captured[];

  it("getPrinters — GET /fulfillment/print/printers?shopCode=", async () => {
    captured = installAdapter(() => ({ status: 200, data: PRINTERS }));
    const store = createAppStore();
    const { data } = await store.dispatch(api.endpoints.getPrinters.initiate("30201"));
    const req = captured.find((c) => c.url.includes("/fulfillment/print/printers"));
    expect(req).toBeDefined();
    expect(req!.method).toBe("get");
    expect(req!.params).toEqual({ shopCode: "30201" });
    expect(data?.items[0].printerId).toBe("PTR-30201-01");
  });

  it("getBatchDetail — GET /fulfillment/batches/:code (encode an toàn)", async () => {
    captured = installAdapter(() => ({ status: 200, data: {} }));
    const store = createAppStore();
    await store.dispatch(api.endpoints.getBatchDetail.initiate("BATCH 9"));
    const req = captured.find((c) => c.url.includes("/fulfillment/batches/"));
    expect(req!.url).toBe("/fulfillment/batches/BATCH%209");
  });

  it("printDocument — POST /fulfillment/print responseType blob → PDF bytes", async () => {
    captured = installAdapter(() => ({ status: 200, data: new Blob([PDF_BYTES]) }));
    const bytes = await printDocument({
      batchCode: "BATCH-0001",
      printType: "bill",
      printerId: "PTR-30201-01",
    });
    const req = captured.find((c) => c.url === "/fulfillment/print");
    expect(req).toBeDefined();
    expect(req!.method).toBe("post");
    expect(req!.responseType).toBe("blob");
    expect(JSON.parse(String(req!.data))).toEqual({
      batchCode: "BATCH-0001",
      printType: "bill",
      printerId: "PTR-30201-01",
    });
    expect(Array.from(bytes)).toEqual(Array.from(PDF_BYTES));
  });

  it("printDocument — lỗi BFF: envelope JSON trong Blob → message thật", async () => {
    // Custom adapter tự resolve mọi status (validateStatus thuộc built-in
    // adapter) → mô phỏng lỗi bằng AxiosError-shape rejection (không runtime-
    // import axios — không phải dep của app, pattern type-only của SF-9),
    // response.data là Blob như axios thật với responseType 'blob'.
    const instance: AxiosInstance = getAxiosInstance();
    instance.defaults.adapter = async (config: AxiosRequestConfig) => {
      throw {
        isAxiosError: true,
        message: "Request failed with status code 400",
        response: {
          status: 400,
          statusText: "BAD",
          headers: {},
          config,
          data: new Blob([JSON.stringify({ statusCode: 400, message: "Batch BATCH-XX not found." })]),
        },
      } as never;
    };
    await expect(
      printDocument({ batchCode: "BATCH-XX", printType: "bill", printerId: "PTR" }),
    ).rejects.toThrow("Batch BATCH-XX not found.");
  });
});
