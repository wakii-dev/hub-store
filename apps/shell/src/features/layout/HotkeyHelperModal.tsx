/**
 * SF-21 D5 — Hotkey helper modal (spec §4): bảng phím tắt đang active + ô
 * search. Nguồn dữ liệu = `hotkeyRegistry` (useHotkeys T6) — snapshot lúc mở
 * (registry là module-level Map, không pub/sub; các context đã unmount biến
 * mất nên snapshot-on-open luôn phản chiếu các màn đang mounted). Filter
 * theo key/mô tả/context, case-insensitive.
 */
import { useEffect, useMemo, useState } from 'react';
import { Input, Modal, Table, Typography } from 'antd';
import { hotkeyRegistry } from '@hub-store/shared';
import type { HotkeyContext } from '@hub-store/shared';

interface Row {
  key: string;
  hotkey: string;
  description: string;
  contextLabel: string;
}

function snapshotRows(): Row[] {
  const rows: Row[] = [];
  for (const ctx of hotkeyRegistry.values()) {
    for (const b of ctx.bindings) {
      rows.push({
        key: `${ctx.id}:${b.key}`,
        hotkey: b.key,
        description: b.description,
        contextLabel: ctx.label || ctx.id,
      });
    }
  }
  return rows;
}

function matches(row: Row, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    row.hotkey.toLowerCase().includes(q) ||
    row.description.toLowerCase().includes(q) ||
    row.contextLabel.toLowerCase().includes(q)
  );
}

export default function HotkeyHelperModal(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');

  // Registry là Map thuần — snapshot mỗi lần mở modal để list phím tắt của
  // đúng các màn đang mounted (useHotkeys tự set/delete theo mount lifecycle).
  useEffect(() => {
    if (open) {
      setRows(snapshotRows());
      setQuery('');
    }
  }, [open]);

  const filtered = useMemo(() => rows.filter((r) => matches(r, query)), [rows, query]);

  const columns = [
    {
      title: 'Phím',
      dataIndex: 'hotkey',
      width: 90,
      render: (hotkey: string) => <kbd style={{ fontWeight: 700 }}>{hotkey}</kbd>,
    },
    { title: 'Mô tả', dataIndex: 'description' },
    { title: 'Màn hình / ngữ cảnh', dataIndex: 'contextLabel' },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Phím tắt"
      footer={null}
      width={520}
      destroyOnClose
      data-testid="hotkey-helper-modal"
    >
      <Input
        placeholder="Tìm theo phím, mô tả hoặc màn hình…"
        allowClear
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
        data-testid="hotkey-search"
      />
      <Table
        size="small"
        pagination={false}
        rowKey="key"
        columns={columns}
        dataSource={filtered}
        locale={{ emptyText: 'Không có phím tắt nào khớp.' }}
      />
      {rows.length > 0 && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
          Chỉ liệt kê phím tắt của các màn hình đang mở. Phím tắt không kích hoạt khi đang gõ trong ô input.
        </Typography.Paragraph>
      )}
    </Modal>
  );
}
