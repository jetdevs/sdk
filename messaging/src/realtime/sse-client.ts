/// <reference lib="dom" />
import type { SSEEvent } from '../types/index.js';

export interface SSEClientConfig {
  /** Full URL to SSE endpoint (e.g., https://messaging.example.com/api/v1/events) */
  url: string;
  /** Short-lived JWT token for browser-safe auth */
  token: string;
  /** Callback for incoming events */
  onEvent: (event: SSEEvent) => void;
  /** Callback for connection errors */
  onError?: (error: Event) => void;
  /** Callback when connection opens */
  onOpen?: () => void;
  /** Initial reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
  /** Max reconnect delay in ms (default: 30000) */
  maxReconnectDelay?: number;
}

/**
 * SSE client wrapper with auto-reconnect and Last-Event-ID tracking.
 * Uses browser EventSource with token-based auth via query param.
 */
export class SSEClient {
  private eventSource: EventSource | null = null;
  private lastEventId: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private config: Required<Pick<SSEClientConfig, 'reconnectDelay' | 'maxReconnectDelay'>> & SSEClientConfig;

  constructor(config: SSEClientConfig) {
    this.config = {
      reconnectDelay: 3000,
      maxReconnectDelay: 30_000,
      ...config,
    };
  }

  connect(): void {
    this.closed = false;
    this.doConnect();
  }

  disconnect(): void {
    this.closed = true;
    this.clearReconnectTimer();
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /** Update the token (e.g., after refresh) and reconnect */
  updateToken(token: string): void {
    this.config.token = token;
    if (this.eventSource) {
      this.eventSource.close();
      this.doConnect();
    }
  }

  private doConnect(): void {
    if (this.closed) return;

    const url = new URL(this.config.url);
    url.searchParams.set('token', this.config.token);
    if (this.lastEventId) {
      url.searchParams.set('lastEventId', this.lastEventId);
    }

    this.eventSource = new EventSource(url.toString());

    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0;
      this.config.onOpen?.();
    };

    this.eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as SSEEvent;
        if (event.lastEventId) {
          this.lastEventId = event.lastEventId;
        }
        this.config.onEvent(parsed);
      } catch {
        // Ignore malformed events
      }
    };

    this.eventSource.onerror = (event) => {
      this.config.onError?.(event);
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.clearReconnectTimer();

    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelay,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
