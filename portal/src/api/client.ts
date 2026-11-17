import { clearStoredLicense, getStoredLicense } from '@/auth/license';

export class ApiError extends Error {
  status: number;
  code?: string;
  body?: unknown;

  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function correlationId(): string {
  return crypto.randomUUID();
}

export type ApiClientOptions = {
  onUnauthorized?: () => void;
};

let onUnauthorizedHandler: (() => void) | undefined;

export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  onUnauthorizedHandler = handler;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Correlation-ID', correlationId());

  const license = getStoredLicense();
  if (license) {
    headers.set('X-License-Key', license);
  }

  const response = await fetch(path, { ...init, headers });

  if (response.status === 401 || response.status === 403) {
    clearStoredLicense();
    onUnauthorizedHandler?.();
    let code: string | undefined;
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      code = body.code;
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, message, code);
  }

  if (!response.ok) {
    let code: string | undefined;
    let message = `HTTP ${response.status}`;
    let body: unknown;
    try {
      body = await response.json();
      const parsed = body as { error?: string; code?: string };
      code = parsed.code;
      if (parsed.error) message = parsed.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, message, code, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('text/csv')) {
    return (await response.text()) as T;
  }

  return (await response.json()) as T;
}
