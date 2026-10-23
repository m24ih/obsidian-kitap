import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';

export const DEFAULT_DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const DEFAULT_REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': DEFAULT_DESKTOP_USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  method?: string;
  body?: string | ArrayBuffer;
  contentType?: string;
}

export class HttpError extends Error {
  status: number;
  url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

/**
 * Executes a promise with an absolute timeout and reliable timer cleanup.
 */
export async function requestWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 10000,
  url = ''
): Promise<T> {
  let timer: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`İstek zaman aşımına uğradı (${timeoutMs}ms): ${url}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

/**
 * Fetches HTML content via Obsidian's native requestUrl with browser headers.
 * Note: tests expect requestUrl to be called with an options object: { url: ..., ... }.
 */
export async function fetchHtml(url: string, options?: HttpRequestOptions): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const param: RequestUrlParam = {
    url,
    method: options?.method ?? 'GET',
    headers: {
      ...DEFAULT_REQUEST_HEADERS,
      ...(options?.headers || {}),
    },
    throw: false,
  };

  if (options?.body !== undefined) {
    param.body = options.body;
  }
  if (options?.contentType !== undefined) {
    param.contentType = options.contentType;
  }

  const reqPromise = requestUrl(param);
  const response: RequestUrlResponse = await requestWithTimeout(reqPromise, timeoutMs, url);

  if (!response) {
    throw new HttpError(`Boş yanıt alındı: ${url}`, 0, url);
  }

  if (response.status >= 400) {
    throw new HttpError(
      `HTTP Hatası ${response.status}: ${url}`,
      response.status,
      url
    );
  }

  return response.text ?? (response.json ? JSON.stringify(response.json) : '');
}

/**
 * Fetches JSON content via Obsidian's native requestUrl.
 * Supports responses that provide either `.json` or `.text`.
 */
export async function fetchJson<T = unknown>(
  url: string,
  options?: HttpRequestOptions
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const param: RequestUrlParam = {
    url,
    method: options?.method ?? 'GET',
    headers: {
      ...DEFAULT_REQUEST_HEADERS,
      Accept: 'application/json, text/plain, */*',
      ...(options?.headers || {}),
    },
    throw: false,
  };

  if (options?.body !== undefined) {
    param.body = options.body;
  }
  if (options?.contentType !== undefined) {
    param.contentType = options.contentType;
  }

  const reqPromise = requestUrl(param);
  const response: RequestUrlResponse = await requestWithTimeout(reqPromise, timeoutMs, url);

  if (!response) {
    throw new HttpError(`Boş yanıt alındı: ${url}`, 0, url);
  }

  if (response.status >= 400) {
    throw new HttpError(
      `HTTP Hatası ${response.status}: ${url}`,
      response.status,
      url
    );
  }

  if (response.json !== undefined) {
    return response.json as T;
  }

  if (typeof response.text === 'string' && response.text.trim()) {
    return JSON.parse(response.text) as T;
  }

  throw new Error(`Geçersiz JSON yanıtı: ${url}`);
}

