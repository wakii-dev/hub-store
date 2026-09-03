/**
 * SF-21 D5 — useHotkeys: global F-key bindings (F4 submit / F6 create / F8 cancel).
 *
 * - window keydown listener; BỎ QUA khi target là input/textarea/contenteditable
 *   (typing không kích hoạt phím tắt).
 * - e.key match + preventDefault. F6 best-effort (browser chrome đôi khi giữ —
 *   không fight thêm, spec D5).
 * - Cleanup gỡ listener + registry entry → StrictMode double-mount an toàn
 *   (set/delete idempotent theo contextId).
 * - Module-level `hotkeyRegistry` (map contextId → context) cho helper modal
 *   (Task 10) đọc khi mở — light: re-render on open, không pub/sub.
 */
import { useEffect, useRef } from 'react';

export type HotkeyKey = 'F4' | 'F6' | 'F8';

export interface HotkeyBinding {
  key: HotkeyKey;
  handler: () => void;
  description: string;
}

export interface HotkeyContext {
  id: string;
  label: string;
  bindings: HotkeyBinding[];
}

/** contextId → context đang mounted (helper modal T10 đọc khi mở). */
export const hotkeyRegistry = new Map<string, HotkeyContext>();

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (el == null) return false;
  return EDITABLE_TAGS.has(el.tagName) || el.isContentEditable === true;
}

export function useHotkeys(
  contextId: string,
  contextLabel: string,
  bindings: HotkeyBinding[],
): void {
  // Handler mới luôn dùng được giữa các render mà không cần re-subscribe —
  // effect chỉ phụ thuộc (contextId, label, tập key) để tránh churn listener.
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const bindingKeys = bindings.map((b) => b.key).join(',');

  useEffect(() => {
    const active: HotkeyContext = {
      id: contextId,
      label: contextLabel,
      bindings: bindingsRef.current,
    };
    hotkeyRegistry.set(contextId, active);

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target)) return;
      const binding = bindingsRef.current.find((b) => b.key === e.key);
      if (binding == null) return;
      e.preventDefault();
      binding.handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      // Chỉ xóa khi registry vẫn trỏ vào context này (không đè context khác).
      if (hotkeyRegistry.get(contextId) === active) hotkeyRegistry.delete(contextId);
    };
  }, [contextId, contextLabel, bindingKeys]);
}
