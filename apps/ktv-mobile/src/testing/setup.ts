// Pin TZ cho suite — reschedule payload assert offset +07:00 (seed/BFF convention);
// không pin → suite gãy trên máy/CI chạy TZ khác (review T6b P1, verified TZ=UTC 2/9 fail).
process.env.TZ = "Asia/Ho_Chi_Minh";

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
