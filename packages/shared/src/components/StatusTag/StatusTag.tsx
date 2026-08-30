import { Tag } from 'antd';
import type { StatusLocale, StatusTagKind } from './tokens';
import {
  STATUS_TAG_LABELS,
  STATUS_TAG_TONE_MAPS,
  STATUS_TAG_TOKENS,
} from './tokens';

export interface StatusTagProps {
  /** Loại status (chọn mapping table) */
  kind: StatusTagKind;
  /** Giá trị status trên wire (0..n) */
  value: number;
  locale?: StatusLocale;
}

/**
 * StatusTag — config-driven: (kind, value) → antd Tag với tone token §7.
 * Unknown value → tone 'info' + label = raw value (không crash UI).
 */
export function StatusTag({ kind, value, locale = 'vi' }: StatusTagProps) {
  const tone = STATUS_TAG_TONE_MAPS[kind]?.[value] ?? 'info';
  const label = STATUS_TAG_LABELS[kind]?.[value]?.[locale] ?? String(value);
  return <Tag color={STATUS_TAG_TOKENS[tone]}>{label}</Tag>;
}
