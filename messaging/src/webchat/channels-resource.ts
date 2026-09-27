import type { HttpClient } from '../http.js';
import type { WebchatIngressRequest, WebchatIngressResponse } from './types.js';

/**
 * Internal channel ingress (Tier-3 X-Service-Secret).
 *
 * The single channel-agnostic inbound seam a trusted app-server posts to when a
 * user turn should become a durable INBOUND turn in message-api. WEBCHAT (the
 * in-app copilot) is the first consumer; Slack T5 consumes the same route later.
 *
 * Requires the client be constructed with `serviceSecret` (Tier-3):
 * ```ts
 * const client = new MessagingClient({ baseUrl, serviceSecret: process.env.MSG_API_SERVICE_SECRET });
 * const resp = await client.channels.ingress({ connectionUuid, message, executionContext });
 * ```
 *
 * The sync response is the RAW contract shape (no ApiResponse envelope):
 *   AI-routed    → { conversationUuid, executionId }        (NO streamUrl — F3)
 *   human-routed → { conversationUuid }
 *   start-fail   → { conversationUuid, error:'responder_start_failed' }
 *   duplicate    → { conversationUuid, duplicate:true }
 */
export class ChannelsResource {
  constructor(private http: HttpClient) {}

  /** POST /api/v1/internal/channels/ingress — persist a durable INBOUND turn and route it. */
  async ingress(request: WebchatIngressRequest): Promise<WebchatIngressResponse> {
    return this.http.post<WebchatIngressResponse>('/api/v1/internal/channels/ingress', request);
  }
}
