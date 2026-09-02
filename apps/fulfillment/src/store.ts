import { createAppStore } from '@hub-store/api-client';

/**
 * Store của remote fulfillment — MỘT instance cho cả remote (spec §2:
 * per-remote store bao gồm reducer + middleware của api singleton; shell
 * không share store qua MF boundary).
 */
export const fulfillmentStore = createAppStore();
