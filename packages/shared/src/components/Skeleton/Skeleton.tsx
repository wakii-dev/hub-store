import { DESIGN_TOKENS } from '../../theme/design-tokens';

/**
 * Skeleton components — SF-6 §2.2 (shimmer, không spinner toàn trang).
 * Dùng class `.sf6-shimmer` (sf6-antd-overrides.css) cho animation.
 */

function Bar({ width, height, radius }: { width: number | string; height: number; radius?: number }) {
  return (
    <div
      className="sf6-shimmer"
      style={{ width, height, borderRadius: radius ?? 6 }}
    />
  );
}

/** StatStrip skeleton — 5 khối radius 12 cao 64 (hand-off §2.2). */
export function StatStripSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 64,
            background: DESIGN_TOKENS.color.bgWhite,
            border: `1px solid ${DESIGN_TOKENS.color.divider}`,
            borderRadius: DESIGN_TOKENS.radius.lg,
            boxShadow: DESIGN_TOKENS.shadow.xs,
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Bar width="45%" height={11} />
          <Bar width="60%" height={16} />
        </div>
      ))}
    </div>
  );
}

/** Table skeleton — 8 hàng shimmer bar (hand-off §2.2). */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      style={{
        background: DESIGN_TOKENS.color.bgWhite,
        border: `1px solid ${DESIGN_TOKENS.color.divider}`,
        borderRadius: DESIGN_TOKENS.radius.card,
        boxShadow: DESIGN_TOKENS.shadow.sm,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <Bar key={i} width="100%" height={32} radius={8} />
      ))}
    </div>
  );
}
