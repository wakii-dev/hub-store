/**
 * Test-only stub: mô phỏng remote KHÔNG tải được — module ném ngay khi
 * evaluate → React.lazy reject → RemoteBoundary hiển thị fallback.
 * Shell vite.config.ts alias các bare specifier federation vào file này
 * (chỉ trong vitest — bare ids không resolve được qua import-analysis).
 */
throw new Error("[test-stub] remote unavailable");

export default function UnavailableRemote() {
  return null;
}
