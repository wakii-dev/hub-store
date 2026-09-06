/**
 * Bundler OpenAPI multi-file → 1 document (FI-326 SF-1, fallback toolchain D1).
 *
 * @fastify/swagger@9 static mode KHÔNG resolve external $ref (probe
 * 2026-09-06: lib/mode/static.js chỉ `yaml.parse` root) → gộp spec tại đây:
 *   1. `paths.x-path-files`   — merge map `paths` của từng file domain
 *      (tier-1 chỉ fill stub của mình, không chạm root — chống merge 7-way).
 *   2. `components.x-component-files` — merge schemas/responses/parameters
 *      từ các file components dùng chung.
 *   3. `$ref` external còn lại (`'./x.yaml#/Pointer'`) resolve đệ quy;
 *      `$ref` nội bộ (`'#/...'`) giữ nguyên — swagger-ui tự resolve sau bundle.
 *
 * Thuần, không phụ thuộc Fastify — drift-guard test dùng chung hàm này nên
 * spec source-of-truth của UI và của test là MỘT.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/** Root spec mặc định — openapi/ travels với service (vào Docker image tự nhiên). */
const DEFAULT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../openapi/openapi.yaml',
);

interface RefNode {
  $ref: string;
}

/** Node `{$ref: '...'}` — CHỈ khi $ref là key duy nhất + trỏ file ngoài. */
function isExternalRef(node: unknown): node is RefNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    !Array.isArray(node) &&
    Object.keys(node).length === 1 &&
    typeof (node as RefNode).$ref === 'string' &&
    !(node as RefNode).$ref.startsWith('#')
  );
}

function loadYaml(absPath: string): Record<string, unknown> {
  return parse(fs.readFileSync(absPath, 'utf8')) as Record<string, unknown>;
}

/** JSON-pointer lookup theo RFC 6901 (`~1` → `/`, `~0` → `~`). */
function pointerLookup(doc: unknown, pointer: string): unknown {
  if (pointer === '') return doc;
  // strip CHỈ '/' đầu (pointer luôn '/a/b'); segment rỗng GIỮ NGUYÊN — lookup
  // miss → lỗi tường minh thay vì âm thầm bỏ qua (code-review P2).
  const segments = pointer.replace(/^\//, '').split('/');
  return segments.reduce<unknown>((acc, segment) => {
    if (acc === null || typeof acc !== 'object') {
      throw new Error(`openapi-bundle: cannot resolve pointer '${pointer}' (walk hit non-object).`);
    }
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    return (acc as Record<string, unknown>)[key];
  }, doc);
}

/**
 * Resolve $ref external đệ quy. `refDepth` đếm CHỈ SỐ HẸP $ref (không phải
 * chiều sâu nest — schema nest sâu hợp lệ không bị false-positive,
 * code-review P2) — cap 32 chống vòng lặp $ref (spec lỗi → fail fast).
 */
function resolveNode(node: unknown, baseDir: string, refDepth: number): unknown {
  if (refDepth > 32) {
    throw new Error('openapi-bundle: chuỗi $ref > 32 hop — nghi vấn vòng lặp $ref trong spec.');
  }
  if (Array.isArray(node)) {
    return node.map((item) => resolveNode(item, baseDir, refDepth));
  }
  if (isExternalRef(node)) {
    const [filePart, pointer = ''] = node.$ref.split('#');
    const abs = path.resolve(baseDir, filePart);
    const doc = loadYaml(abs);
    const target = pointer === '' ? doc : pointerLookup(doc, pointer);
    return resolveNode(target, path.dirname(abs), refDepth + 1);
  }
  if (node !== null && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, value]) => [
        key,
        resolveNode(value, baseDir, refDepth),
      ]),
    );
  }
  return node;
}

/**
 * Bundle root spec + toàn bộ file được pre-wire → 1 document OpenAPI.
 * Duplicate path (2 file khai cùng path-item) = lỗi tường minh — tier-1 thêm
 * path trùng phải thấy ngay, không âm thầm override.
 */
export function bundleOpenApiSpec(rootPath: string = DEFAULT_ROOT): Record<string, unknown> {
  const baseDir = path.dirname(rootPath);
  const root = { ...loadYaml(rootPath) };

  // 1. paths.x-path-files — merge map `paths` của từng file domain.
  const pathsNode = root.paths as Record<string, unknown> | undefined;
  const pathFiles = pathsNode?.['x-path-files'];
  // Path khai trực tiếp trong root (hiếm — nhưng không được âm thầm mất khi
  // merge, bug do unit test bắt 2026-09-06) — seed trước, dup với file = lỗi.
  const mergedPaths: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(pathsNode ?? {})) {
    if (key === 'x-path-files') continue;
    mergedPaths[key] = resolveNode(value, baseDir, 0);
  }
  if (Array.isArray(pathFiles)) {
    for (const rel of pathFiles) {
      const abs = path.resolve(baseDir, String(rel));
      const doc = loadYaml(abs);
      const map = (doc.paths ?? {}) as Record<string, unknown>;
      for (const [key, value] of Object.entries(map)) {
        if (key in mergedPaths) {
          throw new Error(`openapi-bundle: duplicate path '${key}' (file ${rel}).`);
        }
        mergedPaths[key] = resolveNode(value, path.dirname(abs), 0);
      }
    }
  }
  root.paths = mergedPaths;

  // 2. components.x-component-files — merge schemas/responses/parameters…
  const componentsNode = { ...((root.components ?? {}) as Record<string, unknown>) };
  const componentFiles = componentsNode['x-component-files'];
  const mergedComponents: Record<string, unknown> = {};
  if (Array.isArray(componentFiles)) {
    for (const rel of componentFiles) {
      const abs = path.resolve(baseDir, String(rel));
      const doc = loadYaml(abs);
      const comps = (doc.components ?? {}) as Record<string, unknown>;
      for (const [section, values] of Object.entries(comps)) {
        mergedComponents[section] = {
          ...((mergedComponents[section] as Record<string, unknown>) ?? {}),
          ...(values as Record<string, unknown>),
        };
      }
    }
  }
  delete componentsNode['x-component-files'];
  // root-declared (securitySchemes…) thắng file-merge — cùng 1 owner (SF-1).
  root.components = { ...mergedComponents, ...componentsNode };

  return root;
}
