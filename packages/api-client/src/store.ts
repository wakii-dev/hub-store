import { configureStore } from '@reduxjs/toolkit';
import { api } from './api';

/**
 * Store per-remote (spec §2): each MF remote builds its OWN store that includes
 * the shared api-client singleton's reducer + middleware. The shell initializes
 * the api-client (setTokenGetter) — the store instance is NEVER shared across
 * the MF bundle boundary. Remotes call createAppStore() at their bootstrap.
 */
export function createAppStore() {
  return configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
