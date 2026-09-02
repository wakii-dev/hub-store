import { Component, type ReactNode, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import { Alert, Button, Progress, Result, Select, Slider, Space, Spin, Tabs, Typography, message } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { DESIGN_TOKENS, PRINT_TYPES, type PrintType } from '@hub-store/shared';
import { fulfillmentStore } from '../store';
import { printDocument, useGetBatchDetailQuery, useGetPrintersQuery } from '../api/printApi';
import { registerFulfillmentResources } from '../i18n';

// Chạy 1 lần khi module được import (lần đầu bởi shell lazy load, hoặc standalone boot)
registerFulfillmentResources();

/**
 * D3 Print Shipment (SF-10) — exposed qua federation là `fulfillment/PrintPage`
 * → route /hub-store-order/batch/print?batchCode=<code> (param pin SF-9).
 *
 * 5 tab = 5 PrintType; PDF bytes THẬT từ print-service qua BFF (spec §3.7).
 * "In tất cả" = 5 calls TUẦN TỰ 1 call/PDF — KHÔNG có endpoint printAll (pin §3.7).
 */
const PdfPreview = lazy(() => import('../print/PdfPreview'));

type PreviewCache = Partial<Record<PrintType, Uint8Array>>;

/** Bắt lỗi lazy-load/render preview (vd worker/fetch fail) — hiển thị thay vì chết cả route. */
class PreviewErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      return <Alert type="error" showIcon message={`${this.props.label}: ${error}`} />;
    }
    return this.props.children;
  }
}

/** Boundary cấp route: bắt mọi lỗi render/effect của PrintPage (kể cả ngoài preview). */
class PageErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      return <Alert type="error" showIcon message={error} style={{ margin: 24 }} />;
    }
    return this.props.children;
  }
}

export default function PrintPage() {
  return (
    <Provider store={fulfillmentStore}>
      <PageErrorBoundary>
        <PrintPageInner />
      </PageErrorBoundary>
    </Provider>
  );
}

function PrintPageInner() {
  const { t } = useTranslation('fulfillment');
  const [searchParams] = useSearchParams();
  const batchCode = searchParams.get('batchCode') ?? '';

  const [activeType, setActiveType] = useState<PrintType>(PRINT_TYPES[0]);
  const [zoomPct, setZoomPct] = useState(100);
  const [previews, setPreviews] = useState<PreviewCache>({});
  // Per-PrintType (P1 reviewer-sf10): state global gây lỗi chéo tab — tab đã
  // cache hiện nhầm Alert lỗi của tab khác khi quay lại.
  const [previewLoading, setPreviewLoading] = useState<Partial<Record<PrintType, boolean>>>({});
  const [previewError, setPreviewError] = useState<Partial<Record<PrintType, string>>>({});
  const [printerId, setPrinterId] = useState<string | undefined>(undefined);
  const [printing, setPrinting] = useState(false);
  const [printAll, setPrintAll] = useState<{ done: number; total: number; current: string } | null>(null);

  const { data: batch } = useGetBatchDetailQuery(batchCode, { skip: !batchCode });
  const shopCode = batch?.shopCode ?? '';
  const { data: printersData, isLoading: printersLoading } = useGetPrintersQuery(shopCode, {
    skip: !shopCode,
  });
  const printers = printersData?.items ?? [];

  // Load PDF bytes cho tab active (cache per tab — không refetch tab đã load;
  // lỗi/loading theo TỪNG type — không chấm nhầm tab kế).
  const requestSeq = useRef(0);
  const loadPreview = useCallback(
    async (type: PrintType) => {
      if (!batchCode || previews[type]) return;
      const seq = ++requestSeq.current;
      setPreviewLoading((prev) => ({ ...prev, [type]: true }));
      setPreviewError((prev) => ({ ...prev, [type]: undefined }));
      try {
        const bytes = await printDocument({ batchCode, printType: type, printerId: '' });
        if (seq !== requestSeq.current) return; // tab đã đổi — bỏ kết quả cũ
        setPreviews((prev) => ({ ...prev, [type]: bytes }));
        setPreviewLoading((prev) => ({ ...prev, [type]: false }));
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setPreviewError((prev) => ({
          ...prev,
          [type]: err instanceof Error ? err.message : String(err),
        }));
        setPreviewLoading((prev) => ({ ...prev, [type]: false }));
      }
    },
    [batchCode, previews],
  );

  useEffect(() => {
    void loadPreview(activeType);
  }, [activeType, loadPreview]);

  const ensurePrinter = (): string | null => {
    if (printerId) return printerId;
    message.warning(t('print.printer.required'));
    return null;
  };

  const handlePrint = async () => {
    const pid = ensurePrinter();
    if (!pid || !batchCode) return;
    setPrinting(true);
    try {
      await printDocument({ batchCode, printType: activeType, printerId: pid });
      message.success(t('print.success', { doc: t(`print.tab.${activeType}`) }));
    } catch (err) {
      message.error(`${t('print.failed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPrinting(false);
    }
  };

  // "In tất cả" — 5 calls TUẦN TỰ (pin §3.7): await từng PDF trước call kế.
  const handlePrintAll = async () => {
    const pid = ensurePrinter();
    if (!pid || !batchCode || printAll) return;
    setPrintAll({ done: 0, total: PRINT_TYPES.length, current: '' });
    let ok = 0;
    for (const type of PRINT_TYPES) {
      setPrintAll({ done: ok, total: PRINT_TYPES.length, current: t(`print.tab.${type}`) });
      try {
        await printDocument({ batchCode, printType: type, printerId: pid });
        ok += 1;
        setPrintAll({ done: ok, total: PRINT_TYPES.length, current: t(`print.tab.${type}`) });
      } catch (err) {
        message.error(
          `${t('print.failed')} (${t(`print.tab.${type}`)}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    message.success(t('print.all.done', { ok, total: PRINT_TYPES.length }));
    setPrintAll(null);
  };

  if (!batchCode) {
    return (
      <div data-probe="fulfillment-print">
        <Result status="warning" title={t('print.missingBatch')} />
      </div>
    );
  }

  const busy = printing || printAll !== null;

  const tabItems = PRINT_TYPES.map((type) => ({
    key: type,
    label: t(`print.tab.${type}`),
    children: (
      <div className="print-preview-area" style={{ overflow: 'auto', maxHeight: 640, background: DESIGN_TOKENS.color.bgSubtle, textAlign: 'center', padding: 16 }}>
        {previewLoading[type] && <Spin size="large" style={{ marginTop: 80 }} />}
        {!previewLoading[type] && previewError[type] && (
          <Alert type="error" showIcon message={`${t('print.preview.error')}: ${previewError[type]}`} />
        )}
        {!previewLoading[type] && !previewError[type] && previews[type] && (
          <PreviewErrorBoundary label={t('print.preview.error')}>
            <Suspense fallback={<Spin size="large" style={{ marginTop: 80 }} />}>
              <PdfPreview bytes={previews[type]!} scale={zoomPct / 100} />
            </Suspense>
          </PreviewErrorBoundary>
        )}
      </div>
    ),
  }));

  return (
    <div data-probe="fulfillment-print" style={{ padding: 0 }}>
      {/* Page-head — SF-6 §2.2: h1 tokens + sub label */}
      <h1
        style={{
          fontSize: DESIGN_TOKENS.typography.h1.fontSize,
          fontWeight: DESIGN_TOKENS.typography.h1.fontWeight,
          letterSpacing: DESIGN_TOKENS.typography.h1.letterSpacing,
          color: DESIGN_TOKENS.color.textStrong,
          margin: 0,
        }}
      >
        {t('page.print.title')}
      </h1>
      <Typography.Text type="secondary">
        {t('print.batch.label')}: {batchCode}
        {batch?.shopCode ? ` · ${t('print.shop.label')}: ${shopCode}` : ''}
      </Typography.Text>

      <Space wrap style={{ display: 'flex', marginTop: 16, gap: 12 }} align="center">
        <Select
          style={{ minWidth: 240 }}
          placeholder={t('print.printer.placeholder')}
          value={printerId}
          onChange={setPrinterId}
          loading={printersLoading}
          disabled={busy}
          notFoundContent={printersLoading ? <Spin size="small" /> : t('print.printer.empty')}
          options={printers.map((p) => ({
            value: p.printerId,
            label: p.location ? `${p.name} — ${p.location}` : p.name,
          }))}
        />
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
          loading={printing}
          disabled={busy && !printing}
        >
          {t('action.print')}
        </Button>
        <Button onClick={handlePrintAll} loading={printAll !== null} disabled={busy && printAll === null}>
          {t('print.action.printAll')}
        </Button>
        <Space align="center" style={{ marginLeft: 'auto' }}>
          <Typography.Text>{t('print.zoom.label')}</Typography.Text>
          <Slider
            style={{ width: 140, marginBottom: 0 }}
            min={50}
            max={200}
            step={10}
            value={zoomPct}
            onChange={setZoomPct}
            tooltip={{ formatter: (v) => `${v}%` }}
            aria-label={t('print.zoom.label')}
          />
        </Space>
      </Space>

      {printAll && (
        <div style={{ marginTop: 12, maxWidth: 480 }}>
          <Progress
            percent={Math.round((printAll.done / printAll.total) * 100)}
            status="active"
            aria-label={t('print.all.progress')}
          />
          <Typography.Text type="secondary">
            {t('print.all.progress', { done: printAll.done, total: printAll.total, doc: printAll.current })}
          </Typography.Text>
        </div>
      )}

      <Tabs
        activeKey={activeType}
        onChange={(key) => setActiveType(key as PrintType)}
        items={tabItems}
        style={{ marginTop: 16 }}
      />
    </div>
  );
}
