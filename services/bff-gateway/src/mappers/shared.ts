/** Mapper dùng chung fulfillment + batching (TimeRange thuộc fulfillment.proto). */
import type { TimeRange } from '@hub-store/shared';

export function mapTimeRangeFromProto(tr?: { from: string; to: string }): TimeRange {
  return { from: tr?.from ?? '', to: tr?.to ?? '' };
}
