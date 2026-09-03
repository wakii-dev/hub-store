import { beforeEach, describe, expect, it, vi } from "vitest";
import { pollNotifications, seenIds } from "../notificationPoller";

// SF-23 T6 — poller: chỉ trả row CHƯA thấy, seen-ids persist localStorage
// (cap ~200 survive burst). getAxiosInstance mock — poller KHÔNG dùng axios
// thô (shell không có dep), đi qua api-client singleton (spec §4.2).

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@hub-store/api-client", () => ({
  getAxiosInstance: () => ({ get: getMock }),
}));

function mockItems(items: unknown): void {
  getMock.mockResolvedValue({ data: { items } });
}

beforeEach(() => {
  getMock.mockReset();
  localStorage.clear();
});

describe("pollNotifications (SF-23 T6)", () => {
  it("poll 1 → trả tất cả; poll 2 cùng data → rỗng (filter unseen)", async () => {
    mockItems([
      { id: 1, title: "A", body: "x" },
      { id: 2, title: "B", body: "y" },
    ]);
    await expect(pollNotifications()).resolves.toEqual([
      { id: 1, title: "A", body: "x" },
      { id: 2, title: "B", body: "y" },
    ]);
    await expect(pollNotifications()).resolves.toEqual([]);
    expect(getMock).toHaveBeenCalledWith("/api/notifications?page=1&pageSize=10");
  });

  it("seen-ids persist localStorage giữa các poll (cùng storage, không reset module)", async () => {
    mockItems([{ id: 7, title: "T", body: "B" }]);
    await pollNotifications();
    expect(seenIds()).toEqual(new Set([7]));
    expect(JSON.parse(localStorage.getItem("sf23.notification.seenIds")!)).toEqual([7]);
  });

  it("cap 200 — burst không phình localStorage (giữ 200 id MỚI NHẤT)", async () => {
    localStorage.setItem(
      "sf23.notification.seenIds",
      JSON.stringify(Array.from({ length: 200 }, (_, i) => i)),
    );
    mockItems([{ id: 300, title: "N", body: "B" }]);
    await pollNotifications();
    const stored = JSON.parse(localStorage.getItem("sf23.notification.seenIds")!) as number[];
    expect(stored).toHaveLength(200);
    expect(stored).toContain(300);
    expect(stored).not.toContain(0);
  });

  it("items thiếu/shape sai → trả rỗng không throw; corrupt localStorage → seen reset", async () => {
    mockItems(undefined);
    await expect(pollNotifications()).resolves.toEqual([]);
    localStorage.setItem("sf23.notification.seenIds", "{corrupt");
    mockItems([{ id: 9, title: "X", body: "Y" }]);
    await expect(pollNotifications()).resolves.toEqual([
      { id: 9, title: "X", body: "Y" },
    ]);
  });
});
