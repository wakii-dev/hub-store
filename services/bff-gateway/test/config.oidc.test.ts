import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

/**
 * SF-12 live-verify (FI-257): contract "FULL cho cả 3" — OIDC_JWKS_URL có thể
 * là URL certs đầy đủ (cùng 1 env Go/Java interceptor đọc). BFF phải strip
 * suffix certs trước khi derive realm, nếu không jwksUrl + admin* URL bị ghép
 * /realms/hubstore vào CUỐI certs URL (withRealm chỉ idempotent với realm
 * URL) → mọi Bearer DENY (UI trắng sau login — bug chặn 01-main-flow e2e).
 */
describe('loadConfig oidc — FULL certs URL (SF-12)', () => {
  const baseEnv = {
    OIDC_ISSUER: 'http://localhost:8081/realms/hubstore',
    JWT_DEV_SECRET: 'x'.repeat(32),
  };

  it('OIDC_JWKS_URL dạng certs đầy đủ → jwksUrl + admin* URL đúng realm', () => {
    const cfg = loadConfig({
      ...baseEnv,
      OIDC_JWKS_URL:
        'http://localhost:8081/realms/hubstore/protocol/openid-connect/certs',
    } as NodeJS.ProcessEnv);
    expect(cfg.oidc.issuer).toBe('http://localhost:8081/realms/hubstore');
    expect(cfg.oidc.jwksUrl).toBe(
      'http://localhost:8081/realms/hubstore/protocol/openid-connect/certs',
    );
    expect(cfg.oidc.adminBaseUrl).toBe(
      'http://localhost:8081/admin/realms/hubstore',
    );
    expect(cfg.oidc.adminTokenUrl).toBe(
      'http://localhost:8081/realms/master/protocol/openid-connect/token',
    );
    expect(cfg.oidc.kcAdminTokenUrl).toBe(
      'http://localhost:8081/realms/hubstore/protocol/openid-connect/token',
    );
  });

  it('OIDC_JWKS_URL dạng base (compose http://keycloak:8081) → derive như cũ', () => {
    const cfg = loadConfig({
      ...baseEnv,
      OIDC_JWKS_URL: 'http://keycloak:8081',
    } as NodeJS.ProcessEnv);
    expect(cfg.oidc.jwksUrl).toBe(
      'http://keycloak:8081/realms/hubstore/protocol/openid-connect/certs',
    );
    expect(cfg.oidc.adminBaseUrl).toBe(
      'http://keycloak:8081/admin/realms/hubstore',
    );
  });

  it('OIDC_JWKS_URL unset → dùng issuer base (dev host-run)', () => {
    const cfg = loadConfig(baseEnv as NodeJS.ProcessEnv);
    expect(cfg.oidc.jwksUrl).toBe(
      'http://localhost:8081/realms/hubstore/protocol/openid-connect/certs',
    );
  });
});
