import { useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Spin } from 'antd';
import { useTranslation } from 'react-i18next';
// @ts-expect-error pdf.worker.min.mjs không khai báo types cho subpath build
import * as pdfjsWorkerModule from 'pdfjs-dist/build/pdf.worker.min.mjs';

/**
 * PDF preview viewer (SF-10 D3) — LAZY-LOADED qua React.lazy trong PrintPage
 * (pdf.js ~600kB, spike caveat 3: không để vào main chunk của remote).
 *
 * Worker wiring (browser Rule 0 fix 2): FAKE WORKER (main-thread). Cả 2 cách
 * Worker thật đều fail trong federated dev: `?url` → workerSrc cross-origin
 * (remote :3002 vs shell :3000); `?worker&inline` + workerPort → race với
 * React.StrictMode double-mount (loadingTask.destroy() set _pendingDestroy
 * trên shared port → PDFWorker.create throw). Fake worker qua
 * `globalThis.pdfjsWorker` là fallback chính thức của pdf.js (build/pdf.mjs
 * `#mainThreadWorkerMessageHandler`) — deterministic, không shared state.
 * PDF preview vài trang → parse main-thread chấp nhận được.
 */
(globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorkerModule;

interface PdfPreviewProps {
  /** PDF bytes thật từ print-service (qua BFF POST /fulfillment/print). */
  bytes: Uint8Array;
  /** Zoom 0.5–2 (slider PrintPage). */
  scale: number;
}

export default function PdfPreview({ bytes, scale }: PdfPreviewProps) {
  const { t } = useTranslation('fulfillment');
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Blob URL thay vì raw bytes: pdf.js LUÔN transfer data.buffer khi load
  // (pdf.mjs:14158 sendWithPromise GetDocRequest transfers=[data.buffer]) →
  // buffer detach; StrictMode double-mount hoặc reload → structuredClone vào
  // buffer đã detach → lỗi. Blob URL không bị transfer, identity ổn định.
  // KHÔNG revoke trong cleanup: StrictMode cleanup revoke trước khi mount thứ 2
  // fetch → "Unexpected server response (0)". Blob URL sống theo page (≤ vài
  // trăm KB) — chấp nhận được cho trang preview.
  const blobUrl = useMemo(
    () => URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })),
    [bytes],
  );

  return (
    <Document
      file={blobUrl}
      onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
      onLoadError={(err) => setError(err instanceof Error ? err.message : String(err))}
      onSourceError={(err) => setError(err instanceof Error ? err.message : String(err))}
      loading={<Spin size="large" aria-label={t('print.preview.loading')} />}
      error={
        <div role="alert">
          {error ? `${t('print.preview.error')}: ${error}` : t('print.preview.error')}
        </div>
      }
    >
      {Array.from({ length: numPages }, (_, i) => (
        <Page
          key={i + 1}
          pageNumber={i + 1}
          scale={scale}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      ))}
    </Document>
  );
}
