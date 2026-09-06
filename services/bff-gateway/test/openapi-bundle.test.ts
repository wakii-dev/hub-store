/**
 * Unit test cho openapi-bundle (FI-326 SF-1 — code-review P1): bundler là
 * nền của 7 SF tier-1 (mọi cross-file $ref đi qua đây) — regress = UI
 * /documentation vỡ âm thầm. Phủ 5 nhánh: merge x-path-files + x-key removed,
 * duplicate-path throw, RFC 6901 ~0/~1, external $ref đệ quy + internal
 * `#/...` giữ nguyên, depth-cap chuỗi $ref >32 hop, components root-wins.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bundleOpenApiSpec } from '../src/plugins/openapi-bundle.js';
import { stringify } from 'yaml';

let dir: string;

function write(rel: string, doc: object): void {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), stringify(doc));
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf1-bundle-'));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('bundleOpenApiSpec', () => {
  it('merge x-path-files + x-component-files, xóa x-key, giữ root-declared', () => {
    write('openapi.yaml', {
      openapi: '3.0.3',
      info: { title: 'T', version: '0' },
      tags: [{ name: 'System' }],
      paths: { 'x-path-files': ['./paths/system.yaml'] },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
        'x-component-files': ['./components/common.yaml'],
      },
    });
    write('paths/system.yaml', { paths: { '/healthz': { get: { tags: ['System'] } } } });
    write('components/common.yaml', {
      components: { schemas: { ErrorEnvelope: { type: 'object' } } },
    });
    const doc = bundleOpenApiSpec(path.join(dir, 'openapi.yaml')) as Record<string, any>;
    expect(Object.keys(doc.paths)).toEqual(['/healthz']);
    expect(doc.paths['x-path-files']).toBeUndefined();
    expect(doc.components['x-component-files']).toBeUndefined();
    // root-wins: securitySchemes (root) + schemas (file) cùng sống.
    expect(doc.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    expect(doc.components.schemas.ErrorEnvelope.type).toBe('object');
    expect(doc.tags).toEqual([{ name: 'System' }]);
  });

  it('duplicate path giữa 2 file → throw tường minh kèm tên path', () => {
    write('openapi.yaml', {
      paths: { 'x-path-files': ['./paths/a.yaml', './paths/b.yaml'] },
    });
    write('paths/a.yaml', { paths: { '/same': { get: {} } } });
    write('paths/b.yaml', { paths: { '/same': { get: {} } } });
    expect(() => bundleOpenApiSpec(path.join(dir, 'openapi.yaml'))).toThrowError(/\/same/);
  });

  it('RFC 6901: ~1 → / và ~0 → ~ trong pointer', () => {
    write('openapi.yaml', {
      paths: { '/x': { get: { responses: { $ref: './components/r.yaml#/responses/200~1ok' } } } },
    });
    write('components/r.yaml', { responses: { '200/ok': { description: 'OK' } } });
    const doc = bundleOpenApiSpec(path.join(dir, 'openapi.yaml')) as Record<string, any>;
    expect(doc.paths['/x'].get.responses.description).toBe('OK');
  });

  it('external $ref trong path-item resolve đệ quy; internal `#/...` giữ nguyên', () => {
    write('openapi.yaml', {
      paths: { 'x-path-files': ['./paths/system.yaml'] },
    });
    write('paths/system.yaml', {
      paths: {
        '/healthz': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '../components/envelopes.yaml#/schemas/Status' },
                  },
                },
              },
            },
          },
        },
      },
    });
    write('components/envelopes.yaml', {
      schemas: {
        // internal ref — bundler giữ nguyên, swagger-ui tự resolve sau bundle.
        Status: { type: 'object', properties: { nested: { $ref: '#/schemas/Status' } } },
      },
    });
    const doc = bundleOpenApiSpec(path.join(dir, 'openapi.yaml')) as Record<string, any>;
    const schema = doc.paths['/healthz'].get.responses['200'].content['application/json'].schema;
    expect(schema.type).toBe('object'); // external đã resolve
    expect(schema.properties.nested.$ref).toBe('#/schemas/Status'); // internal giữ nguyên
  });

  it('root path khai trực tiếp + x-path-files CÙNG LÚC → coexist; trùng → throw', () => {
    write('openapi.yaml', {
      paths: {
        '/root-direct': { get: {} },
        'x-path-files': ['./paths/system.yaml'],
      },
    });
    write('paths/system.yaml', { paths: { '/from-file': { get: {} } } });
    const doc = bundleOpenApiSpec(path.join(dir, 'openapi.yaml')) as Record<string, any>;
    expect(Object.keys(doc.paths).sort()).toEqual(['/from-file', '/root-direct']);

    write('openapi-dup.yaml', {
      paths: {
        '/clash': { get: {} },
        'x-path-files': ['./paths/clash.yaml'],
      },
    });
    write('paths/clash.yaml', { paths: { '/clash': { get: {} } } });
    expect(() => bundleOpenApiSpec(path.join(dir, 'openapi-dup.yaml'))).toThrowError(/\/clash/);
  });

  it('pointer miss đuôi (typo target) → THROW, không silent-undefined', () => {
    write('openapi.yaml', {
      paths: {
        '/x': { get: { responses: { $ref: './components/r.yaml#/responses/TypoName' } } },
      },
    });
    write('components/r.yaml', { responses: { Real: { description: 'OK' } } });
    expect(() => bundleOpenApiSpec(path.join(dir, 'openapi.yaml'))).toThrowError(
      /TypoName.*không tồn tại/,
    );
  });

  it('trùng component giữa 2 file → throw (không silent last-wins)', () => {
    write('openapi.yaml', {
      components: { 'x-component-files': ['./components/a.yaml', './components/b.yaml'] },
    });
    write('components/a.yaml', { components: { schemas: { Same: { type: 'object' } } } });
    write('components/b.yaml', { components: { schemas: { Same: { type: 'string' } } } });
    expect(() => bundleOpenApiSpec(path.join(dir, 'openapi.yaml'))).toThrowError(
      /schemas\.Same/,
    );
  });

  it('chuỗi $ref > 32 hop → throw depth-cap (nest sâu hợp lệ KHÔNG bị false-positive)', () => {
    // Chain 33 file: chain-0.yaml → chain-1.yaml → … → chain-32.yaml (terminal).
    for (let i = 0; i <= 32; i++) {
      write(
        `chain/chain-${i}.yaml`,
        i === 32 ? { value: 'end' } : { $ref: `./chain-${i + 1}.yaml` },
      );
    }
    write('openapi.yaml', {
      paths: { '/deep': { get: { responses: { $ref: './chain/chain-0.yaml' } } } },
    });
    expect(() => bundleOpenApiSpec(path.join(dir, 'openapi.yaml'))).toThrowError(/32 hop/);

    // Đối chứng: nest object sâu 40 cấp (không $ref) phải bundle bình thường.
    let deep: unknown = { leaf: true };
    for (let i = 0; i < 40; i++) deep = { wrap: deep };
    write('openapi-deep.yaml', { paths: { '/deep2': { get: { x: deep } } } });
    const doc = bundleOpenApiSpec(path.join(dir, 'openapi-deep.yaml')) as Record<string, any>;
    let node: any = doc.paths['/deep2'].get.x;
    for (let i = 0; i < 40; i++) node = node.wrap;
    expect(node.leaf).toBe(true);
  });
});
