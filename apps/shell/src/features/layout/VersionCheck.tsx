/**
 * SF-21 D8 — VersionCheck (spec §4): poll BFF GET /version khi mount + window
 * focus + interval 5'. APP_VERSION unset → BFF trả version null → render
 * nothing + skip checks (KHÔNG prompt-loop). version khác localStorage
 * 'sf.seenVersion' → antd Modal "Phiên bản mới" + nút reload; click reload:
 * set seenVersion TRƯỚC khi location.reload() để không lặp lại prompt.
 * Badge nhỏ hiển thị version ở header (ẩn khi null). Fetch qua axios singleton
 * (@hub-store/api-client — Bearer tự gắn như mọi BFF call khác).
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Modal, Tag } from 'antd';
import { getAxiosInstance } from '@hub-store/api-client';

export const SEEN_VERSION_KEY = 'sf.seenVersion';
const POLL_MS = 5 * 60 * 1000;

export default function VersionCheck() {
  const [version, setVersion] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const check = useCallback(async () => {
    let latest: string | null = null;
    try {
      const { data } = await getAxiosInstance().get<{ version: string | null }>('/version');
      latest = typeof data?.version === 'string' ? data.version : null;
    } catch {
      return; // BFF chưa sẵn sàng — giữ nguyên trạng thái, không prompt.
    }
    if (latest === null) {
      setVersion(null);
      setShowPrompt(false);
      return;
    }
    setVersion(latest);
    const seen = localStorage.getItem(SEEN_VERSION_KEY);
    if (seen !== latest) setShowPrompt(true);
  }, []);

  useEffect(() => {
    void check();
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => void check(), POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [check]);

  const onReload = useCallback(() => {
    if (version !== null) localStorage.setItem(SEEN_VERSION_KEY, version);
    window.location.reload();
  }, [version]);

  return (
    <>
      {version !== null && (
        <Tag
          style={{ marginInlineEnd: 0, cursor: 'default' }}
          data-testid="version-badge"
        >
          v{version}
        </Tag>
      )}
      <Modal
        open={showPrompt}
        title="Phiên bản mới available"
        footer={[
          <Button key="reload" type="primary" onClick={onReload} data-testid="version-reload">
            Tải lại trang
          </Button>,
        ]}
        closable
        onCancel={() => setShowPrompt(false)}
      >
        Đã có phiên bản mới của ứng dụng. Tải lại trang để sử dụng phiên bản mới nhất.
      </Modal>
    </>
  );
}
