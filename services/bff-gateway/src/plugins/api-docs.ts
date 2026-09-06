/**
 * Swagger UI cho REST surface của BFF (FI-326 SF-1) — DEV-ONLY, flag-gated.
 *
 * Bật: env `BFF_ENABLE_API_DOCS=1` (pattern `=== '1'` như
 * ENABLE_DEV_RESET_PASSWORD trong config.ts). Prod/K8s không set flag →
 * KHÔNG mount gì cả (fail-safe — "không mount thay vì dựa vào doc"; route
 * không tồn tại → 404 sau guard, không surface mới).
 *
 * Toolchain (verdict FALLBACK, probe 2026-09-06): @fastify/swagger@9 static
 * mode không resolve external $ref → bundle tại đây (openapi-bundle.ts) rồi
 * serve swagger-ui-dist qua @fastify/static tại prefix /documentation:
 *   GET /documentation            → index.html (SwaggerUIBundle init)
 *   GET /documentation/spec.json  → spec đã bundle (in-memory, không file disk)
 *   GET /documentation/<asset>    → swagger-ui-dist static (css/js/oauth2-redirect)
 *
 * Guard: prefix /documentation thuộc auth skip-list (plugins/auth.ts — FI-326).
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { bundleOpenApiSpec } from './openapi-bundle.js';

const require = createRequire(import.meta.url);
const SWAGGER_UI_DIST = path.dirname(require.resolve('swagger-ui-dist/package.json'));

/** Index tối giản — SwaggerUIBundle đọc spec từ /documentation/spec.json. */
const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hub Store BFF API — Swagger UI</title>
  <link rel="stylesheet" href="/documentation/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/documentation/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/documentation/spec.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
      });
    };
  </script>
</body>
</html>
`;

/**
 * ĐỒNG BỘ hoàn toàn — CỐT: nếu hàm này async, `app.register(fastifyStatic)`
 * của nó chạy ở microtask SAU khi buildApp return (sau `app.ready()` bắt đầu
 * boot queue) → register plugin vào root context giữa boot = avvio deadlock,
 * ready() treo vĩnh viễn (bẫy đã tự đâm khi boot verify — FI-326 T7). Sync:
 * static plugin + routes được queue như mọi plugin khác của buildApp.
 */
export function registerApiDocs(app: FastifyInstance): void {
  // Fail-safe: CHỈ mount khi flag bật tường minh — unset/rỗng/giá trị khác = không mount.
  if (process.env.BFF_ENABLE_API_DOCS !== '1') {
    return;
  }
  // Bundle fail-fast khi spec lỗi (dev-only surface — chết sớm dễ debug hơn UI trắng).
  const spec = bundleOpenApiSpec();
  void app.register(fastifyStatic, {
    root: SWAGGER_UI_DIST,
    prefix: '/documentation/',
    decorateReply: false,
  });
  app.get('/documentation', async (_request, reply) => {
    void reply.type('text/html; charset=utf-8');
    return INDEX_HTML;
  });
  app.get('/documentation/spec.json', async () => spec);
}
