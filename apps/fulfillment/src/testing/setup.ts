// jsdom không có matchMedia — antd Select/Grid (responsiveObserve) crash khi
// render trong vitest. Copy pattern từ apps/shell/src/testing/setup.ts (SF-6).
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
