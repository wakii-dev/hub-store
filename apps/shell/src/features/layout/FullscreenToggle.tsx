/**
 * SF-21 D7 — Fullscreen toggle (spec §4): header button + F11 hotkey cùng
 * handler. Toggle documentElement.requestFullscreen()/exitFullscreen(), Safari
 * fallback webkitRequestFullscreen/webkitExitFullscreen. Nghe fullscreenchange
 * để cập nhật icon. API unavailable (jsdom/old browser) → button ẩn (không
 * no-op treo UI). F11 preventDefault để chặn browser default.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Tooltip } from 'antd';
import { FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';

type FsDoc = Document & {
  webkitExitFullscreen?: () => void;
  webkitFullscreenElement?: Element | null;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };

function fullscreenElement(): Element | null {
  const doc = document as FsDoc;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function requestFullscreen(el: FsElement): void {
  if (typeof el.requestFullscreen === 'function') {
    void el.requestFullscreen();
  } else if (typeof el.webkitRequestFullscreen === 'function') {
    el.webkitRequestFullscreen();
  }
}

function exitFullscreen(doc: FsDoc): void {
  if (typeof doc.exitFullscreen === 'function') {
    void doc.exitFullscreen();
  } else if (typeof doc.webkitExitFullscreen === 'function') {
    doc.webkitExitFullscreen();
  }
}

export default function FullscreenToggle() {
  const supported = typeof document !== 'undefined' && (
    typeof (document.documentElement as FsElement).requestFullscreen === 'function' ||
    typeof (document.documentElement as FsElement).webkitRequestFullscreen === 'function' ||
    typeof (document as FsDoc).webkitExitFullscreen === 'function'
  );
  const [isFullscreen, setIsFullscreen] = useState(() => fullscreenElement() !== null);

  useEffect(() => {
    if (!supported) return;
    const onChange = () => setIsFullscreen(fullscreenElement() !== null);
    document.addEventListener('fullscreenchange', onChange);
    // webkit variant không fire fullscreenchange chuẩn trên Safari cũ.
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [supported]);

  const toggle = useCallback(() => {
    const doc = document as FsDoc;
    if (fullscreenElement() !== null) {
      exitFullscreen(doc);
    } else {
      requestFullscreen(document.documentElement as FsElement);
    }
  }, []);

  useEffect(() => {
    if (!supported) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [supported, toggle]);

  if (!supported) return null;

  return (
    <Tooltip title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}>
      <Button
        type="text"
        icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
        onClick={toggle}
        data-testid="fullscreen-toggle"
        aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
      />
    </Tooltip>
  );
}
