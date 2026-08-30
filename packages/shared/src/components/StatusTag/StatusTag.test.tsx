import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusTag } from './StatusTag';
import {
  STATUS_TAG_LABELS,
  STATUS_TAG_TONE_MAPS,
  STATUS_TAG_TOKENS,
} from './tokens';

afterEach(cleanup);

describe('StatusTag', () => {
  it('maps each status kind + value to VI label with §7 tone color', () => {
    const cases: Array<[Parameters<typeof StatusTag>[0]['kind'], number, string, string]> = [
      ['batchStatus', 0, 'Chưa soạn', STATUS_TAG_TOKENS.info],
      ['batchStatus', 1, 'Đang soạn', STATUS_TAG_TOKENS.warning],
      ['batchStatus', 2, 'Đã soạn', STATUS_TAG_TOKENS.success],
      ['batchStatus', 3, 'Lỗi vượt trọng lượng', STATUS_TAG_TOKENS.error],
      ['orderStatus', 0, 'Chờ duyệt', STATUS_TAG_TOKENS.warning],
      ['orderStatus', 1, 'Đã duyệt', STATUS_TAG_TOKENS.success],
      ['orderStatus', 2, 'Từ chối duyệt', STATUS_TAG_TOKENS.error],
      ['coordinationStatus', 0, 'Chờ điều phối', STATUS_TAG_TOKENS.info],
      ['coordinationStatus', 1, 'Đang điều phối', STATUS_TAG_TOKENS.warning],
      ['coordinationStatus', 2, 'Hoàn tất điều phối', STATUS_TAG_TOKENS.success],
      ['batchEntityStatus', 0, 'Đang soạn', STATUS_TAG_TOKENS.info],
      ['batchEntityStatus', 1, 'Hoàn tất', STATUS_TAG_TOKENS.success],
      ['batchEntityStatus', 2, 'Đã hủy', STATUS_TAG_TOKENS.error],
    ];
    for (const [kind, value, label, color] of cases) {
      render(<StatusTag kind={kind} value={value} />);
      const tag = screen.getByText(label).closest('.ant-tag');
      expect(tag, `${kind}=${value}`).not.toBeNull();
      expect(tag).toHaveStyle({ backgroundColor: color });
      cleanup();
    }
  });

  it('supports EN labels (VI↔EN toggle)', () => {
    render(<StatusTag kind="batchStatus" value={2} locale="en" />);
    expect(screen.getByText('Prepared')).not.toBeNull();
  });

  it('unknown value falls back to info tone + raw value label', () => {
    render(<StatusTag kind="orderStatus" value={99} />);
    const tag = screen.getByText('99').closest('.ant-tag');
    expect(tag).toHaveStyle({ backgroundColor: STATUS_TAG_TOKENS.info });
  });

  it('every value in every tone map has a VI+EN label', () => {
    for (const kind of Object.keys(STATUS_TAG_TONE_MAPS) as Array<
      keyof typeof STATUS_TAG_TONE_MAPS
    >) {
      for (const value of Object.keys(STATUS_TAG_TONE_MAPS[kind])) {
        expect(STATUS_TAG_LABELS[kind][Number(value)], `${kind}=${value}`).toBeDefined();
        expect(STATUS_TAG_LABELS[kind][Number(value)].vi).toBeTruthy();
        expect(STATUS_TAG_LABELS[kind][Number(value)].en).toBeTruthy();
      }
    }
  });
});
