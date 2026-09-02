/**
 * FilterBar — layout container cho filter screen (D1/D2).
 * Grid 2 hàng × 4 cột (REQUIREMENTS §3 D1: "8 filter fields,
 * 2 hàng × 4 cột") + hàng nút Reset + Search.
 *
 * Labels button mặc định là placeholder — SF-6 bind i18n qua props.
 * Dùng CSS grid (không antd Row/Col responsive) — desktop-only 1440px,
 * tránh phụ thuộc window.matchMedia.
 */
import { Button, Space } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

export interface FilterBarProps {
  /** Filter field primitives — 8 fields chiếm đủ grid 2×4. */
  children: ReactNode;
  onSearch?: () => void;
  onReset?: () => void;
  searchLabel?: string;
  resetLabel?: string;
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 12,
};

export function FilterBar({
  children,
  onSearch,
  onReset,
  searchLabel = 'Search',
  resetLabel = 'Reset',
}: FilterBarProps) {
  return (
    <div data-testid="filter-bar" style={{ marginBottom: 18 }}>
      <div style={gridStyle}>{children}</div>
      <Space style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Button onClick={onReset}>{resetLabel}</Button>
        <Button type="primary" onClick={onSearch}>
          {searchLabel}
        </Button>
      </Space>
    </div>
  );
}
