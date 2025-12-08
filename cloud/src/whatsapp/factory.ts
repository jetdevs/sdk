/**
 * WhatsApp Client Factory
 *
 * Creates and manages WhatsApp client instances.
 *
 * SECURITY: Token management is handled by credentials-service.
 * The client no longer requires OAuth credentials.
 */

import { createLogger } from '../lib/logger';
import { WhatsAppClient } from './client';
import { resetWhatsAppTokenCache } from './token-cache';
import type { WabaConfig } from './types';

const log = createLogger('WhatsAppFactory');

// globalThis cache for Next.js HMR compatibility
const globalForCache = globalThis as unknown as {
  __yobo_whatsapp_client?: WhatsAppClient;
};

let whatsappClient: WhatsAppClient | null = globalForCache.__yobo_whatsapp_client ?? null;

/**
 * Create a new WhatsApp client instance
 *
 * Note: No credentials needed - tokens are fetched from credentials-service
 */
export function createWhatsAppClient(): WhatsAppClient {
  return new WhatsAppClient();
}

/**
 * Get the default WhatsApp client instance (singleton)
 */
export function getWhatsAppClient(): WhatsAppClient {
  if (!whatsappClient) {
    whatsappClient = createWhatsAppClient();
    globalForCache.__yobo_whatsapp_client = whatsappClient;
    log.debug('WhatsApp client created');
  }
  return whatsappClient;
}

/**
 * Reset the WhatsApp client and token cache
 */
export function resetWhatsAppClient(): void {
  whatsappClient = null;
  globalForCache.__yobo_whatsapp_client = undefined;
  resetWhatsAppTokenCache();
  log.debug('WhatsApp client and token cache reset');
}

/**
 * Convenience export for quick access
 *
 * Usage:
 * ```ts
 * import { whatsapp } from '@yobolabs/cloud/whatsapp';
 * await whatsapp.sendTemplateMessage({ ... });
 *
 * // With WABA config for multi-tenant
 * await whatsapp.sendTemplateMessage({
 *   templateId: 'hello',
 *   phoneNumber: '6281234567890',
 *   wabaId: 'org-specific-waba-id',
 *   senderLabel: 'org-sender-label',
 * });
 * ```
 */
export const whatsapp = {
  /**
   * Upload media for template creation
   * @param imageUrl - URL of the image to upload
   * @param options - Optional WABA configuration
   */
  uploadMediaForTemplate: async (imageUrl: string, options?: WabaConfig) =>
    getWhatsAppClient().uploadMediaForTemplate(imageUrl, options),

  /**
   * Upload media for message sending
   * @param imageUrl - URL of the image to upload
   * @param options - Optional WABA configuration
   */
  uploadMediaForSending: async (imageUrl: string, options?: WabaConfig) =>
    getWhatsAppClient().uploadMediaForSending(imageUrl, options),

  /**
   * Create a new template
   */
  createTemplate: async (...args: Parameters<WhatsAppClient['createTemplate']>) =>
    getWhatsAppClient().createTemplate(...args),

  /**
   * Get template status
   * @param templateId - Template ID to check
   * @param options - Optional WABA configuration
   */
  getTemplateStatus: async (templateId: string, options?: WabaConfig) =>
    getWhatsAppClient().getTemplateStatus(templateId, options),

  /**
   * Delete a template
   * @param templateId - Template ID to delete
   * @param options - Optional WABA configuration
   */
  deleteTemplate: async (templateId: string, options?: WabaConfig) =>
    getWhatsAppClient().deleteTemplate(templateId, options),

  /**
   * Send a template message
   */
  sendTemplateMessage: async (...args: Parameters<WhatsAppClient['sendTemplateMessage']>) =>
    getWhatsAppClient().sendTemplateMessage(...args),

  /**
   * Send a carousel message
   */
  sendCarouselMessage: async (...args: Parameters<WhatsAppClient['sendCarouselMessage']>) =>
    getWhatsAppClient().sendCarouselMessage(...args),

  /**
   * Check configuration status
   */
  checkConfig: async () => getWhatsAppClient().checkConfig(),

  /**
   * Check if WhatsApp is configured (synchronous - checks local cache)
   */
  isConfigured: (): boolean => {
    try {
      // This is a quick check - actual config check is async
      return !!whatsappClient;
    } catch {
      return false;
    }
  },
};
