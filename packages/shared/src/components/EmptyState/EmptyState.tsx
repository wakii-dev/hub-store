import { Button } from 'antd';
import React from 'react';
import { DESIGN_TOKENS } from '../../theme/design-tokens';

export interface EmptyStateProps {
  title: string;
  sub?: string;
  /** Optional action — ghost button dưới cùng (VD: "Xóa bộ lọc") */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * EmptyState — SF-6 §2.2: minh họa line-art hộp hàng +cam, title 14/600,
 * sub 12.5, optional ghost action. Center trong card, padding 48px.
 */
export function EmptyState({ title, sub, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        gap: 6,
        textAlign: 'center',
      }}
    >
      {/* Line-art hộp hàng: icon đơn giản + accent cam */}
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        fill="none"
        aria-hidden="true"
        style={{ marginBottom: 8 }}
      >
        <path
          d="M8 20l20-9 20 9v18L28 47 8 38V20z"
          stroke={DESIGN_TOKENS.color.primary}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M8 20l20 9 20-9M28 29v18"
          stroke={DESIGN_TOKENS.color.primary}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M18 15.5l20 9"
          stroke={DESIGN_TOKENS.color.primaryBorder}
          strokeWidth="2"
        />
      </svg>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: DESIGN_TOKENS.color.textStrong,
        }}
      >
        {title}
      </div>
      {sub ? (
        <div
          style={{
            fontSize: 12.5,
            color: DESIGN_TOKENS.color.textMuted,
          }}
        >
          {sub}
        </div>
      ) : null}
      {actionLabel && onAction ? (
        <Button style={{ marginTop: 10 }} onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
