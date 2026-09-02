import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";
import { defineConfig } from "vitest/config";
import { antdLessModifyVars } from "../../packages/shared/src/theme/shared-theme";

const configDir = __dirname;

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
  optimizeDeps: {
    // react-pdf/SPIKE 2 verdict (SF-10): pre-bundle pdfjs main entry.
    // Worker dùng FAKE WORKER (globalThis.pdfjsWorker — import trực tiếp
    // pdf.worker.min.mjs trong PdfPreview), không cần exclude gì.
    include: ['pdfjs-dist'],
  },
  plugins: [
    react(),
    federation({
      name: "fulfillment",
      filename: "remoteEntry.js",
      exposes: {
        "./BatchListPage": "./src/pages/BatchListPage.tsx",
        "./PrintPage": "./src/pages/PrintPage.tsx",
      },
      shared: mfShared,
    }),
  ],
  server: { port: 3002, host: true },
  build: { target: "esnext" },
  css: {
    preprocessorOptions: {
      // antd 4 theming: LESS modifyVars at build time (ConfigProvider has no `theme` in antd 4)
      less: { javascriptEnabled: true, modifyVars: antdLessModifyVars },
    },
  },
  test: { environment: "jsdom", setupFiles: [resolve(configDir, "src/testing/setup.ts")] },
});
