// @vitest-environment node — jose cần crypto.subtle (Node Web Crypto), chắc chắn có ở node env.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  decodeFakeJwt,
  resolveDevJwtSecret,
  signFakeJwt,
} from './fake-jwt';

const SECRET = 'test-secret-not-the-real-one';

// Không có @types/node trong FE package — truy cập process qua cast có cấu trúc.
const proc = (globalThis as { process?: { env: Record<string, string | undefined> } })
  .process!;

describe('fake-jwt', () => {
  let original: string | undefined;
  beforeAll(() => {
    // decodeFakeJwt đọc env (resolution priority 3) — seed để test path env chạy thật.
    original = proc.env.JWT_DEV_SECRET;
    proc.env.JWT_DEV_SECRET = SECRET;
  });
  afterAll(() => {
    if (original === undefined) delete proc.env.JWT_DEV_SECRET;
    else proc.env.JWT_DEV_SECRET = original;
  });

  it('sign → decode round-trip giữ nguyên payload', async () => {
    const token = await signFakeJwt(
      { sub: 'user-42', role: 'Coordinator' },
      { secret: SECRET },
    );
    const decoded = await decodeFakeJwt(token);
    expect(decoded.sub).toBe('user-42');
    expect(decoded.role).toBe('Coordinator');
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('resolveDevJwtSecret đọc process.env (priority 3)', () => {
    expect(resolveDevJwtSecret()).toBe(SECRET);
  });

  it('tampered token bị từ chối', async () => {
    const token = await signFakeJwt(
      { sub: 'user-42', role: 'Manager' },
      { secret: SECRET },
    );
    const [header, payload, signature] = token.split('.');
    const tampered = [header, payload, signature.slice(0, -2) + 'xx'].join('.');
    await expect(decodeFakeJwt(tampered)).rejects.toThrow();
  });

  it('token hết hạn (negative exp) bị từ chối', async () => {
    const token = await signFakeJwt(
      { sub: 'user-42', role: 'WarehouseOps' },
      { secret: SECRET, expiresIn: -60 },
    );
    await expect(decodeFakeJwt(token)).rejects.toThrow();
  });

  it('đúng format, sai secret → token bị từ chối', async () => {
    const token = await signFakeJwt(
      { sub: 'user-42', role: 'Manager' },
      { secret: 'another-secret' },
    );
    await expect(decodeFakeJwt(token)).rejects.toThrow();
  });

  describe('missing secret → lỗi rõ ràng', () => {
    beforeAll(() => {
      delete proc.env.JWT_DEV_SECRET;
    });
    afterAll(() => {
      proc.env.JWT_DEV_SECRET = SECRET;
    });

    it('signFakeJwt throw với message chỉ rõ chỗ đặt secret', async () => {
      await expect(
        signFakeJwt({ sub: 'user-1', role: 'Manager' }),
      ).rejects.toThrow(/JWT_DEV_SECRET/);
    });

    it('resolveDevJwtSecret throw khi thiếu hoàn toàn', () => {
      expect(() => resolveDevJwtSecret()).toThrow(/Missing dev JWT secret/);
    });
  });
});
