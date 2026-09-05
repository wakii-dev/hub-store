/**
 * orderStatsApi — thống kê ĐƠN TOÀN CỤC cho StatStrip (BFF
 * /fulfillment/order-status-stats): GROUP BY batch_status toàn bảng + tổng
 * COD chờ giao. axios SINGLETON của @hub-store/api-client (token tự gắn —
 * pattern settlementApi/areaStaffApi; không đưa vào RTKQ store của remote).
 */
import { useEffect, useState } from 'react';
import { getAxiosInstance } from '@hub-store/api-client';

export interface OrderStatusStats {
  counts: Array<{ batchStatus: number; count: number }>;
  codPending: number;
}

export function fetchOrderStatusStats(): Promise<OrderStatusStats> {
  return getAxiosInstance()
    .get('/fulfillment/order-status-stats')
    .then((r) => r.data);
}

/** Load 1 lần khi mount — số liệu toàn hệ thống, không phụ thuộc page/filter. */
export function useOrderStatusStats(): { stats: OrderStatusStats | null; isLoading: boolean } {
  const [stats, setStats] = useState<OrderStatusStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchOrderStatusStats()
      .then((d) => {
        if (alive) setStats(d);
      })
      .catch(() => {
        /* 503/401 — giữ null, tile hiện 0 */
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { stats, isLoading };
}
