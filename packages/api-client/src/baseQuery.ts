import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { BaseQueryFn } from '@reduxjs/toolkit/query';

// ---- Axios singleton -------------------------------------------------------

type ViteEnv = { VITE_API_BASE_URL?: string } & Record<string, string | undefined>;
const env = (import.meta as unknown as { env?: ViteEnv }).env ?? {};

/**
 * Axios instance — created ONCE (module singleton). The api-client is a federation
 * singleton, so shell + both remotes share this exact instance at runtime.
 */
const axiosInstance: AxiosInstance = axios.create({
  baseURL: env.VITE_API_BASE_URL ?? 'http://localhost:8080',
});

/** Getter so the shell can reach the instance and attach interceptors later if needed. */
export function getAxiosInstance(): AxiosInstance {
  return axiosInstance;
}

// ---- Token registration (spec §2: NO React context crosses the MF boundary) --

export type TokenGetter = () => string | null | Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

/**
 * Register the token getter — invoked by the request interceptor on EVERY request.
 * The shell calls this once at init (SF-6). Idempotent: re-registration REPLACES
 * the previous getter; the interceptor itself is attached exactly once below.
 */
export function setTokenGetter(fn: TokenGetter): void {
  tokenGetter = fn;
}

/**
 * Read-only accessor (SF-10 T4): token hiện tại từ getter đã đăng ký — dùng cho
 * SSE `?access_token=` (EventSource không set header được). Đồng bộ theo spec §2
 * (shell đăng ký getter đồng bộ); getter async → null (SSE path không await).
 */
export function getStoredToken(): string | null {
  if (!tokenGetter) return null;
  const token = tokenGetter();
  return typeof token === 'string' ? token : null;
}

axiosInstance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (!tokenGetter) return config;
  const token = await tokenGetter();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

// ---- BFF envelopes (spec §3.1) ---------------------------------------------

/** BFF pagination envelope — passed through UNTOUCHED as `data`. */
export interface PaginationEnvelope<T = unknown> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** BFF error envelope — the `data` of a failed result. */
export interface ErrorEnvelope {
  statusCode: number;
  message: string;
  code?: string;
  details?: unknown[];
}

// ---- axiosBaseQuery ---------------------------------------------------------

export type AxiosBaseQueryArg = {
  url: string;
  method?: AxiosRequestConfig['method'];
  data?: unknown;
  params?: AxiosRequestConfig['params'];
  headers?: AxiosRequestConfig['headers'];
};

export type AxiosBaseQueryError = {
  status: number | 'FETCH_ERROR';
  /** ErrorEnvelope when the BFF responded; raw message on network failure. */
  data: unknown;
};

/**
 * RTK Query baseQuery wrapping the shared axios instance (spec §2 chốt axios for
 * prod parity: interceptors apply to RTK Query traffic too).
 * - Success: pagination envelope `{ items, total, page, pageSize }` passes through
 *   as `{ data }` — consumers/transformResponse read `items`/`total` directly.
 * - Failure: the error envelope `{ statusCode, message, code?, details? }` becomes
 *   `{ error: { status, data } }` (status = HTTP status; 'FETCH_ERROR' when the
 *   network itself failed).
 */
export const axiosBaseQuery: BaseQueryFn<AxiosBaseQueryArg, unknown, AxiosBaseQueryError> = async ({
  url,
  method = 'GET',
  data,
  params,
  headers,
}) => {
  try {
    const result = await axiosInstance.request({ url, method, data, params, headers });
    return { data: result.data };
  } catch (err) {
    const axiosError = err as AxiosError;
    if (axiosError.response) {
      return { error: { status: axiosError.response.status, data: axiosError.response.data } };
    }
    return { error: { status: 'FETCH_ERROR', data: axiosError.message } };
  }
};
