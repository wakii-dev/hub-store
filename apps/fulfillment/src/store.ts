import { createAppStore } from '@hub-store/api-client';

// SF-14 — endpoint inject (codApi) đăng ký vào api SINGLETON lúc import module.
import './api/codApi';

/**
 * Store của remote fulfillment — MỘT instance cho cả remote (spec §2:
 * per-remote store bao gồm reducer + middleware của api singleton; shell
 * không share store qua MF boundary).
 */
export const fulfillmentStore = createAppStore();
