/**
 * WhatsApp SDK Module
 *
 * Provides WhatsApp API integration through Credentials Service.
 *
 * @example
 * ```typescript
 * import { whatsapp } from '@jetdevs/cloud/whatsapp';
 *
 * // Send a template message
 * const result = await whatsapp.sendTemplateMessage({
 *   templateId: 'my_template',
 *   phoneNumber: '6281234567890',
 *   bodyParameters: ['John', 'Order #123'],
 * });
 *
 * // Send a carousel message
 * const carouselResult = await whatsapp.sendCarouselMessage({
 *   templateId: 'carousel_template',
 *   phoneNumber: '6281234567890',
 *   cards: [
 *     { imageUrl: 'https://example.com/image1.jpg', bodyParameters: ['Product 1'] },
 *     { imageUrl: 'https://example.com/image2.jpg', bodyParameters: ['Product 2'] },
 *   ],
 * });
 * ```
 */

// Types
export type {
  CarouselCard,
  ConfigCheckResult, CreateTemplateRequest,
  CreateTemplateResponse, DeleteTemplateOptions, MediaUploadOptions, MediaUploadResponse, SendCarouselMessageRequest,
  SendMessageResponse, SendTemplateMessageRequest, TemplateComponent, TemplateStatusOptions,
  TemplateStatusResponse, WabaConfig,
  WhatsAppCredentials,
  WhatsAppTokenResponse
} from './types';

// Classes
export { WhatsAppClient } from './client';
export { WhatsAppTokenCache } from './token-cache';

// Factory
export { createWhatsAppClient, getWhatsAppClient, resetWhatsAppClient, whatsapp } from './factory';
