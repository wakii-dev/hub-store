// jsdom không có matchMedia — antd (responsiveObserve) crash khi render. Stub
// tối thiểu theo antd test convention (giống shell SF-6 / orders).
Object.defineProperty(globalThis, "matchMedia", {
  configurable: true,
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
