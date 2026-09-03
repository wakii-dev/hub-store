// SF-23 T6 — notification polling (spec §4.2): FE chủ động poll
// /api/notifications mỗi 30s (BFF push là best-effort — spec §4.2 coi polling
// là đường chắc chắn). KHÔNG import axios thô (shell không có dep đó) — dùng
// getAxiosInstance() từ @hub-store/api-client: baseURL VITE_API_BASE_URL đã
// cấu hình + Bearer token tự gắn qua token getter shell đã register.
//
// seen-ids lưu localStorage (cap ~200 — survive burst): mỗi poll chỉ trả về
// các row CHƯA thấy để caller hiện antd notification.

import { getAxiosInstance } from "@hub-store/api-client";

const SEEN_KEY = "sf23.notification.seenIds";
const SEEN_CAP = 200;

export function seenIds(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as number[]);
  } catch {
    return new Set();
  }
}

function saveSeen(ids: Set<number>): void {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-SEEN_CAP)));
}

export interface NewNotification {
  id: number;
  title: string;
  body: string;
}

/** Poll 1 lần — trả về rows mới (chưa thấy) để caller hiện antd notification. */
export async function pollNotifications(): Promise<NewNotification[]> {
  const { data } = await getAxiosInstance().get("/api/notifications?page=1&pageSize=10");
  const seen = seenIds();
  const items = (data?.items ?? []) as Array<{ id: number; title?: string; body?: string }>;
  const fresh = items
    .filter((n) => !seen.has(n.id))
    .map((n) => ({ id: n.id, title: n.title ?? "", body: n.body ?? "" }));
  fresh.forEach((n) => seen.add(n.id));
  saveSeen(seen);
  return fresh;
}
