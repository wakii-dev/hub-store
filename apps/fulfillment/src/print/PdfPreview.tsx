import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * PDF preview viewer (SF-10 D3) — LAZY-LOADED qua React.lazy trong PrintPage
 * (pdf.js ~600kB, spike caveat 3: không để vào main chunk của remote).
 *
 * Worker wiring theo SPIKE 2 verdict (GO): `?url` import + GlobalWorkerOptions.
 * Cross-origin worker (remote :3002 vs shell :3000) OK trong dev — Vite 5 dev
 * server CORS default ON; prod verify thuộc SF-11.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfPreviewProps {
  /** PDF bytes thật từ print-service (qua BFF POST /fulfillment/print). */
  bytes: Uint8Array;
  /** Zoom 0.5–2 (slider PrintPage). */
  scale: number;
}

export default function PdfPreview({ bytes, scale }: PdfPreviewProps) {
  const { t } = useTranslation('fulfillment');
  const [numPages, setNumPages] = useState(0);

  return (
    <Document
      file={{ data: bytes }}
      onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
      loading={<Spin size="large" aria-label={t('print.preview.loading')} />}
      error={<div role="alert">{t('print.preview.error')}</div>}
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
