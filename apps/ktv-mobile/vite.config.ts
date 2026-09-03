import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { antdLessModifyVars } from "../../packages/shared/src/theme/shared-theme";

// SF-25 (FI-270) — standalone PWA cho KTV/CTV: KHÔNG federation plugin,
// KHÔNG mfShared (không share scope nào — bundle khép kín, port 3010).
export default defineConfig({
  plugins: [react()],
  server: { port: 3010, host: true },
  // maxParallelFileOps 2 (default 20): máy dev share với nhiều stack song song —
  // burst mở file của rollup chạm ENFILE (file table overflow) khi concurrent
  // cao. Build chậm hơn chút nhưng deterministic (SF-25 T3).
  build: { target: "esnext", rollupOptions: { maxParallelFileOps: 2 } },
  css: {
    preprocessorOptions: {
      // antd 4 theming: LESS modifyVars at build time (ConfigProvider has no `theme` in antd 4)
      less: { javascriptEnabled: true, modifyVars: antdLessModifyVars },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/testing/setup.ts"],
  },
});
