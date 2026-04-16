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

// ============================================================================
// Cookie strategy — RELY ON the platform cookie store
//
// The server sets the `skb_host` session cookie with HttpOnly + SameSite=Lax.
// An earlier version of this file tried to read Set-Cookie from the fetch
// Response and maintain a manual `cookieJar` string. That broke on iOS:
//
//   1. On successful login, `res.headers.get('set-cookie')` returned null
//      (HttpOnly strips it from JS) so the jar stayed empty; subsequent
//      requests sent no Cookie header AND iOS's own auto-attach was already
//      bypassed — every authed endpoint 401'd.
//   2. Any stale jar value restored from SecureStore overrode iOS's fresh
//      cookie, producing 401s even after a clean re-login.
//
// React Native's fetch uses NSURLSession on iOS and OkHttpClient on Android,
// both of which maintain a shared cookie store, persist cookies across
// launches, and auto-attach them to matching-origin requests. All we have
// to do is NOT set a Cookie header ourselves. `credentials: 'include'` is
// the default but we pass it explicitly for clarity.
// ============================================================================

// Deprecated — kept so existing callers compile through a rollout; no-ops
// now that the platform manages cookies. Remove once all callers are gone.
export function setCookie(_cookie: string | null): void { /* no-op */ }
export function getCookie(): string | null { return null; }

function apiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && envUrl.length > 0) return envUrl.replace(/\/+$/, '');
  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (fromExtra) return fromExtra.replace(/\/+$/, '');
  return 'http://localhost:3000';
}

function locationId(): string {
  return process.env.EXPO_PUBLIC_LOCATION_ID ?? 'skb';
}

// Exported for unit tests — don't rely on this in application code.
export function buildUrl(path: string): string {
  const base = apiBaseUrl();
  const loc = locationId();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  // Server mounts host API at /r/:loc/api/host/* (see src/mcp-server.ts).
  // Earlier builds omitted /api, so every call 404'd — that's the PIN 1234 bug.
  return `${base}/r/${loc}/api${suffix}`;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  const controller = new AbortController();
  const compositeSignal = signal
    ? anySignal([signal, controller.signal])
    : controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const res = await fetch(buildUrl(path), {
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
      throw new ApiError(res.status, code, `${method} ${path} → ${res.status} ${code}`, errBody);
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
