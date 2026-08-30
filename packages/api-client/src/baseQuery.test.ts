import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { axiosBaseQuery, getAxiosInstance, setTokenGetter } from './baseQuery';

const instance = getAxiosInstance();
// BaseQueryFn's `api`/`extraOptions` params are not exercised by these unit tests.
const apiStub = {} as unknown as Parameters<typeof axiosBaseQuery>[1];

describe('axiosBaseQuery', () => {
  it('passes the pagination envelope through untouched on success', async () => {
    const envelope = { items: [{ id: 1 }], total: 1, page: 1, pageSize: 20 };
    const spy = vi
      .spyOn(instance, 'request')
      .mockResolvedValue({ data: envelope } as unknown as AxiosResponse);
    try {
      const result = await axiosBaseQuery(
        { url: '/fulfillment/filter', method: 'POST', data: { shopCode: '30201' } },
        apiStub,
        {},
      );
      expect(result).toEqual({ data: envelope });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/fulfillment/filter',
          method: 'POST',
          data: { shopCode: '30201' },
        }),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('returns { error: { status, data } } with the BFF error envelope on HTTP error', async () => {
    const envelope = {
      statusCode: 503,
      message: 'batching-service unavailable',
      code: 'UPSTREAM_UNAVAILABLE',
    };
    const config = {} as InternalAxiosRequestConfig;
    const response = { data: envelope, status: 503, statusText: 'Service Unavailable', headers: {}, config };
    const spy = vi
      .spyOn(instance, 'request')
      .mockRejectedValue(new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, {}, response as AxiosResponse));
    try {
      const result = await axiosBaseQuery({ url: '/batches' }, apiStub, {});
      expect(result).toEqual({ error: { status: 503, data: envelope } });
    } finally {
      spy.mockRestore();
    }
  });

  it('returns FETCH_ERROR when the request fails without a response (network)', async () => {
    const spy = vi
      .spyOn(instance, 'request')
      .mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    try {
      const result = await axiosBaseQuery({ url: '/anything' }, apiStub, {});
      expect(result).toEqual({ error: { status: 'FETCH_ERROR', data: 'Network Error' } });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('setTokenGetter', () => {
  let captured: InternalAxiosRequestConfig | undefined;

  beforeEach(() => {
    captured = undefined;
    instance.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      } as unknown as AxiosResponse;
    };
  });

  afterEach(() => {
    setTokenGetter(() => null);
    instance.defaults.adapter = undefined;
  });

  it('attaches Authorization: Bearer from the registered getter', async () => {
    setTokenGetter(() => 'token-123');
    await instance.get('/anything');
    expect(captured?.headers?.get('Authorization')).toBe('Bearer token-123');
  });

  it('supports async getters and re-registration is idempotent (last one wins)', async () => {
    setTokenGetter(async () => 'async-token');
    setTokenGetter(async () => 'final-token');
    await instance.get('/anything');
    expect(captured?.headers?.get('Authorization')).toBe('Bearer final-token');
  });

  it('omits the Authorization header when the getter returns null', async () => {
    setTokenGetter(() => null);
    await instance.get('/anything');
    expect(captured?.headers?.get('Authorization')).toBeUndefined();
  });
});
