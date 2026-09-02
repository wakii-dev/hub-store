# Spike 1 — Vite Module Federation + React 18 + AntD 4.24.16 singleton

**Verdict: `@module-federation/vite@1.21.1`** passes all 4 checks.
`@originjs/vite-plugin-federation@1.4.1` FAILS dev mode (cannot load a remote from a Vite dev server) — rejected.

- Date: 2026-08-31 · Node v24.10.0 (works fine, no Node-version issue)
- Sandbox: `/tmp/sf1-spikes/spike2/{host,remote}` (candidate 2), `/tmp/sf1-spikes/spike1/{host,remote}` (candidate 1)
- Runtime verification: headless Chrome (puppeteer-core), evidence JSONs at `/tmp/sf1-spikes/spike2/{dev,prod}-result.json`

## Chosen versions

| Package | Version |
|---|---|
| @module-federation/vite | **1.21.1** |
| @module-federation/runtime | ^0.21.0 |
| vite | **5.4.19** (plugin peer allows ^5 || ^6 || ^7 || ^8; 5.4.19 tested) |
| react / react-dom | 18.3.1 |
| antd | **4.24.16** (pinned) |
| @vitejs/plugin-react | ^4.3.4 |

## Checklist

### 1. dev-pass — PASS
Both `vite` dev servers (host :5173, remote :5174). Host `import('remote/D1Page')` loads the remote's dev-served remoteEntry; antd primary Button renders, `antd.version` = 4.24.16, probe counter shared between host and remote modules (host reads `1` after remote D1Page's module-level `bumpProbe()` ran — same instance).
Evidence: `/tmp/sf1-spikes/spike2/dev-result.json` (`d1Page: true`, `primaryBtn: "D1 Primary Button"`, `antdVersion: "antd@4.24.16"`).
(Only console error is the cosmetic `favicon.ico` 404.)

### 2. build-pass — PASS
`vite build` clean for both apps (Vite 5.4.19, ~2–3 s each). Remote emits `dist/remoteEntry.js` (~17 kB) + shared `loadShare` chunks; host emits its own remoteEntry + eager shared chunks.

### 3. publicPath-prod-pass — PASS
Both dists served statically (`vite preview`; remote on :5174, host on :4173). Host loads `http://localhost:5174/remoteEntry.js` (built remoteEntry at **dist root**, not `assets/`), remote component renders, probe 0→1.
Evidence: `/tmp/sf1-spikes/spike2/prod-result.json`.

### 4. singleton-no-duplicate-bundle — PASS (runtime)
- Runtime share scope (`__FEDERATION__.__INSTANCES__[0].shareScopeMap.default`): exactly **1 registration each** for `react` (18.3.1), `react-dom` (18.3.1), `antd` (4.24.16). No duplicate versions negotiated in.
- Module-instance probe (`./probe` with module-level counter): host's `getProbeCount()` observes the remote's `bumpProbe()` — 0 before load, 1 after — single module instance across host+remote.
- No duplicate-React symptoms (no "Invalid hook call", no double-render errors, console clean apart from favicon 404).
- On-disk nuance: each dist bundles its own antd shared chunk (`_virtual_mf_..._loadShare__antd__...js`, ~984 kB each). This is by design — each app ships a shared *candidate*; at runtime the share scope resolves to exactly one instance. AntD code is not duplicated *within* an app's bundle graph (single `loadShare` chunk per app).

## Candidate 1: @originjs/vite-plugin-federation@1.4.1 — REJECTED

| Check | Result | Evidence |
|---|---|---|
| dev-pass | **FAIL** | Host dev runtime does `import('http://remote:5174/assets/remoteEntry.js')`, but the remote dev server never serves `remoteEntry.js` — `devExposePlugin` in the plugin is a **no-op** (`dist/index.mjs`: only returns `{name: "originjs:expose-development"}`). The URL falls through to Vite's SPA fallback (returns `index.html` as `text/html`), so the import fails. |
| build-pass | PASS | Both apps build clean. |
| publicPath-prod-pass | PASS | Built remoteEntry served statically; button renders, antd 4.24.16, probe 0→1. |
| singleton-no-duplicate-bundle | PASS (runtime) | Probe counter 0→1 same instance; `__federation_shared_antd` chunk loaded once. |

Rejection reason: dev workflow (HMR, no pre-build) is a hard requirement for the platform; originjs requires building the remote (`vite build --watch` + static serve) for any dev work — unacceptable DX and incompatible with the microfrontend dev story.

## Working config — host `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'host',
      remotes: {
        remote: {
          type: 'module',                                  // REQUIRED: forces ESM dynamic-import, not <script> tag
          name: 'remote',
          // dev AND build: remoteEntry is served at the remote server ROOT
          entry: 'http://localhost:5174/remoteEntry.js',
          entryGlobalName: 'remote',
          shareScope: 'default',
        },
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        antd: { singleton: true, requiredVersion: '4.24.16' },
      },
    }),
  ],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { target: 'esnext' },
});
```

## Working config — remote `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'remote',
      filename: 'remoteEntry.js',
      exposes: {
        './D1Page': './src/D1Page.tsx',
        './probe': './src/probe.ts',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        antd: { singleton: true, requiredVersion: '4.24.16' },
      },
    }),
  ],
  server: { port: 5174 },
  preview: { port: 4174 },
  build: { target: 'esnext' },
});
```

Host app code (key part):

```tsx
const RemoteD1Page = React.lazy(() => import('remote/D1Page'));
import { getProbeCount } from 'remote/probe'; // works in dev and prod
```

## Known caveats / gotchas

1. **`type: 'module'` is mandatory** on remote declarations. Without it the runtime injects a classic `<script>` tag; the ESM remoteEntry contains `import.meta` → `SyntaxError: Cannot use 'import.meta' outside a module` → `#RUNTIME-001`.
2. **remoteEntry URL is root-relative in both dev and prod** (`http://<remote>/remoteEntry.js`), NOT `/assets/remoteEntry.js`. The build emits `dist/remoteEntry.js` at root.
3. **Dev-vs-prod entry divergence**: in the first attempt, dev entry `/assets/remoteEntry.js` appeared to work only because a stale server from another spike was bound to the port. URLs must be verified against the intended server.
4. **CORS**: remote dev server must allow the host origin (Vite 5 dev server sends `Access-Control-Allow-Origin` by default; verified with `Origin` header). If hosts are on other domains in prod, configure `server.cors` / static-host CORS explicitly.
5. **DTS plugin noise**: the plugin logs `[ Module Federation DTS ]` download attempts (`@mf-types.zip`) in dev; harmless, can be disabled via plugin options if unwanted.
6. **AntD 4 theming**: `ConfigProvider` does not restyle primary color in antd 4 (that's an antd 5 API). Color override needs antd4 mechanisms (less `modifyVars` / css override) — out of scope for this spike; the check here was rendering + singleton.
7. **Vite version**: tested on 5.4.19. Peer range of @module-federation/vite@1.21.1 is ^5 || ^6 || ^7 || ^8, so later Vite upgrades stay possible; re-run this spike checklist if the repo adopts Vite 6/7.
8. `@originjs/vite-plugin-federation@1.4.1` also works fine **in prod-only** setups — viable fallback only if the org ever drops dev-server federation.

## Fallback recommendation

Not needed — candidate 2 passes all checks. If `@module-federation/vite` is later blocked (e.g. Vite upgrade conflict), fallback order: (a) @originjs/vite-plugin-federation with pre-built remote (`vite build --watch` + static serve for dev), (b) full `@module-federation/enhanced`/webpack MF decision — deferred per spike scope.
