import { Tag } from 'antd';
import type { StatusLocale, StatusTagKind } from './tokens';
import {
  STATUS_TAG_LABELS,
  STATUS_TAG_LINE,
  STATUS_TAG_TEXT,
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
 * StatusTag — config-driven: (kind, value) → antd Tag pastel pill (SF-6 §2.2).
 * bg pastel + line border + solid text + chấm tròn (::before qua class
 * `sf6-status-tag` trong sf6-antd-overrides.css). Unknown value → tone 'info'.
 */
export function StatusTag({ kind, value, locale = 'vi' }: StatusTagProps) {
  const tone = STATUS_TAG_TONE_MAPS[kind]?.[value] ?? 'info';
  const label = STATUS_TAG_LABELS[kind]?.[value]?.[locale] ?? String(value);
  return (
    <Tag
      className="sf6-status-tag"
      color={STATUS_TAG_TOKENS[tone]}
      style={{ color: STATUS_TAG_TEXT[tone], borderColor: STATUS_TAG_LINE[tone] }}
    >
      {label}
    </Tag>
  );
}
