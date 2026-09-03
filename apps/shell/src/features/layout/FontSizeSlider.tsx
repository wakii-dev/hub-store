/**
 * SF-21 D6 — font-size slider header (12–20, step 1). Apply ngay khi kéo
 * (applyFontSize → CSS var trên <html> + persist). antd4 không có runtime
 * token nên scale chạy qua CSS variable `--app-font-size` (global override
 * trong sf6-antd-overrides.css map body + main text surfaces). Init từ
 * localStorage lúc mount — reload giữ giá trị.
 */
import { useState } from 'react';
import { Slider, Tooltip } from 'antd';
import { FontSizeOutlined } from '@ant-design/icons';
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  applyFontSize,
  initFontSizeFromStorage,
} from '@hub-store/shared';

export default function FontSizeSlider() {
  const [fontSize, setFontSize] = useState(() => initFontSizeFromStorage());

  return (
    <Tooltip title={`${fontSize}px`}>
      <span
        style={{
          height: 34,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 12px',
          borderRadius: 17,
          border: '1px solid #EAECF0',
          background: '#ffffff',
        }}
        data-testid="font-size-slider"
      >
        <FontSizeOutlined style={{ fontSize: 12.5, color: '#344054' }} />
        <Slider
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={1}
          value={fontSize}
          onChange={(v) => {
            setFontSize(v);
            applyFontSize(v);
          }}
          tooltip={{ open: false }}
          style={{ width: 90, margin: 0 }}
        />
      </span>
    </Tooltip>
  );
}
