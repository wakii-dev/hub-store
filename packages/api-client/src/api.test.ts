import { configureStore } from '@reduxjs/toolkit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AxiosResponse } from 'axios';
import { api, createListQuery, LIST_QUERY_DEFAULTS } from './api';
import { getAxiosInstance } from './baseQuery';
import { tagTypes } from './tags';
// Register the stub endpoints (same side effect as importing the package index).
import { masterDataApi } from './slices/masterData';

function createTestStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
  });
}

describe('api singleton', () => {
  it('declares the pinned tag scheme (invalidating each tag type raises no unknown-tag error)', () => {
    const store = createTestStore();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // RTK 2.x logs to console.error when a tag type is not in `tagTypes`.
      store.dispatch(
        api.util.invalidateTags([
          { type: 'Fulfillment', id: 'LIST' },
          { type: 'Batches', id: 'LIST' },
          { type: 'MasterData', id: 'SHOPS' },
          { type: 'D2c', id: 'LIST' }, // SF-18 D2C slice
        ]),
      );
      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('not specified in `tagTypes`'),
        expect.anything(),
      );
    } finally {
      errorSpy.mockRestore();
    }
    expect(tagTypes).toEqual(['Fulfillment', 'Batches', 'MasterData', 'D2c']);
  });

  it('ships the refetchOnMount:"always" default via the api config (spec §2)', () => {
    const store = createTestStore();
    const state = store.getState()[api.reducerPath] as unknown as {
      config: { refetchOnMountOrArgChange: boolean };
    };
    expect(state.config.refetchOnMountOrArgChange).toBe(true);
  });

  it('createListQuery applies the shared list defaults', () => {
    const definition = createListQuery({ query: () => ({ url: '/x' }) });
    expect(definition.keepUnusedDataFor).toBe(LIST_QUERY_DEFAULTS.keepUnusedDataFor);
    // caller-provided fields survive the merge
    const withTags = createListQuery({
      query: () => ({ url: '/x' }),
      providesTags: () => [{ type: 'Fulfillment', id: 'LIST' }],
    });
    expect(withTags.providesTags).toBeDefined();
  });

  it('stub list endpoints actually refetch on re-mount (refetchOnMount:"always" behavior)', async () => {
    let calls = 0;
    const instance = getAxiosInstance();
    instance.defaults.adapter = async (config) => {
      calls += 1;
      return {
        data: { items: [], total: 0, page: 1, pageSize: 20 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      } as unknown as AxiosResponse;
    };
    try {
      const store = createTestStore();
      // Mount 1: initial fetch.
      const first = store.dispatch(masterDataApi.endpoints.getShops.initiate());
      await first.unwrap();
      first.unsubscribe();
      expect(calls).toBe(1);
      // Mount 2 (remote re-mounts on cross-remote navigation): cache is still
      // fresh, but a new subscription + the api-wide default must trigger a
      // real refetch — the cross-remote invalidation contract (spec §2). With
      // the RTK stock default (false) this would stay 1.
      const second = store.dispatch(masterDataApi.endpoints.getShops.initiate());
      await second.unwrap();
      expect(calls).toBe(2);
    } finally {
      instance.defaults.adapter = undefined;
    }
  });
});

afterEach(() => {
  // vitest keeps the module-level singleton across files; make sure no adapter leaks.
  getAxiosInstance().defaults.adapter = undefined;
});
