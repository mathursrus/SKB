import Constants from 'expo-constants';

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body?: JsonValue,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

export function setCookie(_cookie: string | null): void { /* no-op */ }
export function getCookie(): string | null { return null; }

function apiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && envUrl.length > 0) return envUrl.replace(/\/+$/, '');
  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (fromExtra) return fromExtra.replace(/\/+$/, '');
  return 'http://localhost:3000';
}

function defaultLocationId(): string {
  return process.env.EXPO_PUBLIC_LOCATION_ID ?? 'skb';
}

export function buildTenantUrl(locationId: string, path: string): string {
  const base = apiBaseUrl();
  const loc = encodeURIComponent(locationId);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}/r/${loc}/api${suffix}`;
}

export function buildPlatformUrl(path: string): string {
  const base = apiBaseUrl();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}/api${suffix}`;
}

export function buildUrl(path: string): string {
  return buildTenantUrl(defaultLocationId(), path);
}

/**
 * Build a per-location web admin URL for opening in Safari from the iOS app.
 * `tab` matches the data-tab attributes used in public/admin.html (dashboard,
 * profile, website, menu, frontdesk, messaging, staff, integrations).
 *
 * We deliberately bypass the per-location `publicHost` (which may not have its
 * DNS set up — see issue #45) and route through the canonical apiBaseUrl host
 * with the `/r/:loc/` prefix that always works.
 */
export function buildAdminUrl(locationId: string, tab?: string): string {
  const base = apiBaseUrl();
  const loc = encodeURIComponent(locationId);
  const query = tab ? `?tab=${encodeURIComponent(tab)}` : '';
  return `${base}/r/${loc}/admin.html${query}`;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  locationId?: string;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return requestInternal<T>(buildTenantUrl(opts.locationId ?? defaultLocationId(), path), path, opts);
}

export async function platformRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return requestInternal<T>(buildPlatformUrl(path), path, opts);
}

async function requestInternal<T>(
  url: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  const controller = new AbortController();
  const compositeSignal = signal
    ? anySignal([signal, controller.signal])
    : controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: compositeSignal,
      credentials: 'include',
    });

    if (!res.ok) {
      const errBody = await safeJson(res);
      const code = (errBody && typeof errBody === 'object' && 'error' in errBody
        ? String((errBody as { error: unknown }).error)
        : 'http_error') as string;
      throw new ApiError(res.status, code, `${method} ${path} -> ${res.status} ${code}`, errBody);
    }

    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as { name?: string }).name === 'AbortError') {
      throw new ApiError(0, 'timeout', `${method} ${path} timed out after ${timeoutMs}ms`);
    }
    throw new ApiError(0, 'network', `${method} ${path} network error: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function safeJson(res: Response): Promise<JsonValue | undefined> {
  try {
    return (await res.json()) as JsonValue;
  } catch {
    return undefined;
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      return controller.signal;
    }
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}
