import type { ApiError, ApiResponse, MessagingClientConfig, PaginatedResponse, CursorPaginatedResponse } from './types/index.js';

/**
 * Low-level HTTP client with auth headers, retry, and error handling.
 * Follows the same pattern as cadra-sdk/src/utils/http.ts.
 */
export class HttpClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;
  private maxRetries: number;

  constructor(config: MessagingClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 30_000;
    this.maxRetries = config.maxRetries ?? 3;

    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (config.serviceSecret) {
      this.headers['X-Service-Secret'] = config.serviceSecret;
    } else if (config.apiKey) {
      this.headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    if (config.orgId) {
      this.headers['X-Org-Id'] = config.orgId;
    }
    if (config.platformKey) {
      this.headers['X-Platform-Key'] = config.platformKey;
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>('GET', url);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>('POST', url, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>('PATCH', url, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>('PUT', url, body);
  }

  async delete<T>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>('DELETE', url);
  }

  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers: this.headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          // 204 No Content
          if (response.status === 204) {
            return undefined as T;
          }
          return (await response.json()) as T;
        }

        // Retry on 429 (rate limit) or 503 (service unavailable)
        if ((response.status === 429 || response.status === 503) && attempt < this.maxRetries) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.min(1000 * Math.pow(2, attempt), 10_000);
          await sleep(delay);
          continue;
        }

        // Parse error response
        let apiError: ApiError | undefined;
        try {
          apiError = (await response.json()) as ApiError;
        } catch {
          // Non-JSON error body
        }

        throw new MessagingApiError(
          apiError?.error?.message ?? `HTTP ${response.status}`,
          response.status,
          apiError?.error?.code ?? 'UNKNOWN_ERROR',
          apiError?.error?.details,
          apiError?.meta?.requestId,
        );
      } catch (err) {
        if (err instanceof MessagingApiError) {
          throw err;
        }
        lastError = err as Error;
        if (attempt < this.maxRetries) {
          await sleep(Math.min(1000 * Math.pow(2, attempt), 10_000));
          continue;
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }
}

export class MessagingApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'MessagingApiError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-export response types for resource convenience
export type { ApiResponse, PaginatedResponse, CursorPaginatedResponse };
