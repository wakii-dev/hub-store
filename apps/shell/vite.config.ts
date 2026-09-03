import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";
import { defineConfig } from "vitest/config";
import { antdLessModifyVars } from "../../packages/shared/src/theme/shared-theme";

/**
 * remotes.config.json là NGUỒN runtime-editable duy nhất (SF-7/SF-9 chỉ
 * sửa entry của mình, không đụng shell code). Đọc tại config-eval time.
 */
interface RemoteEntryConfig {
  url: string;
  exposes: Record<string, string>;
}

const configDir = dirname(fileURLToPath(import.meta.url));
const remotesConfig: Record<string, RemoteEntryConfig> = JSON.parse(
  readFileSync(resolve(configDir, "../../remotes.config.json"), "utf-8"),
);

/** Spike verdict: remote declarations PHẢI có `type: 'module'`; remoteEntry ở ROOT. */
const remotes = Object.fromEntries(
  Object.entries(remotesConfig).map(([name, cfg]) => [
    name,
    {
      type: "module",
      name,
      entry: cfg.url,
      entryGlobalName: name,
      shareScope: "default",
    },
  ]),
);

/** Singleton share scope — per spike verdict + spec §2 P0 list. */
const mfShared = {
  react: { singleton: true, requiredVersion: "^18.0.0" },
  "react-dom": { singleton: true, requiredVersion: "^18.0.0" },
  // SF-11 convergence fix: jsx-runtime PHẢI là share đăng ký sync lúc MF init —
  // nếu không, pre-bundle react-pdf (automatic jsx runtime) loadShare async
  // CHẬM hơn render đầu → "_jsx2 is not a function" (D3 preview chết).
  "react/jsx-runtime": { singleton: true, requiredVersion: "^18.0.0" },
  "react/jsx-dev-runtime": { singleton: true, requiredVersion: "^18.0.0" },
  antd: { singleton: true, requiredVersion: "4.24.16" },
  "@reduxjs/toolkit": { singleton: true, requiredVersion: "^2.12.0" },
  "react-redux": { singleton: true, requiredVersion: "^9.0.0" },
  "react-router-dom": { singleton: true, requiredVersion: "^6.30.0" },
  i18next: { singleton: true, requiredVersion: "^26.0.0" },
  "react-i18next": { singleton: true, requiredVersion: "^17.0.0" },
  // Workspace packages — TS source qua pnpm symlink (Vite compile được).
  // Singleton để setTokenGetter / usePermissions state là MỘT instance
  // chung shell + remotes.
  "@hub-store/shared": { singleton: true },
  "@hub-store/api-client": { singleton: true },
};

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "shell",
      remotes,
      shared: mfShared,
    }),
  ],
  // Root .env là nguồn env chung (JWT_DEV_SECRET + VITE_* FE config) — shell
  // đọc VITE_JWT_DEV_SECRET / VITE_OIDC_* từ đó cho auth stub.
  envDir: resolve(configDir, "../.."),
  server: { port: 3000, host: true },
  build: { target: "esnext" },
  css: {
    preprocessorOptions: {
      // antd 4 theming: LESS modifyVars at build time (ConfigProvider has no `theme` in antd 4)
      less: { javascriptEnabled: true, modifyVars: antdLessModifyVars },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [resolve(configDir, "src/testing/setup.ts")],
    // Bare federation specifiers không resolve được trong vitest (import-analysis
    // chạy trước MF transform) → alias vào stub ném lỗi = mô phỏng remote chết.
    alias: {
      "orders/DashboardPage": resolve(configDir, "src/testing/unavailableRemote.ts"),
      "orders/D1Page": resolve(configDir, "src/testing/unavailableRemote.ts"),
      "orders/D2CPage": resolve(configDir, "src/testing/unavailableRemote.ts"),
      "fulfillment/BatchListPage": resolve(configDir, "src/testing/unavailableRemote.ts"),
      "fulfillment/PrintPage": resolve(configDir, "src/testing/unavailableRemote.ts"),
    },
  },
});
