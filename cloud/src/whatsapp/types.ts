/**
 * WhatsApp SDK Types
 *
 * Type definitions for WhatsApp API integration.
 */

/**
 * WABA (WhatsApp Business Account) configuration
 * Used for multi-tenant scenarios where each organization has its own WABA
 */
export interface WabaConfig {
  /** WhatsApp Business Account ID */
  wabaId?: string;
  /** Sender label for phone number identification, defaults to 'META_DEFAULT' */
  senderLabel?: string;
}

/**
 * @deprecated WhatsApp credentials are no longer exposed.
 * Credentials are now managed internally by credentials-service.
 * SDK only receives temporary access tokens via getWhatsAppToken().
 */
export interface WhatsAppCredentials {
  apiUrl: string;
  clientId?: string; // Deprecated - no longer returned
  clientSecret?: string; // Deprecated - no longer returned
}

/**
 * OAuth token response
 */
export interface WhatsAppTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Media upload response
 */
export interface MediaUploadResponse {
  success: boolean;
  mediaHandle?: string;
  error?: string;
}

/**
 * Media upload request options
 */
export interface MediaUploadOptions extends WabaConfig {
  /** Image URL to upload */
  imageUrl: string;
}

/**
 * Template component types
 */
export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: {
    header_handle?: string[];
    body_text?: string[][];
  };
  buttons?: Array<{
    type: string;
    text: string;
    url?: string;
  }>;
}

/**
 * Create template request
 */
export interface CreateTemplateRequest extends WabaConfig {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: TemplateComponent[];
}

/**
 * Create template response
 */
export interface CreateTemplateResponse {
  success: boolean;
  templateId?: string;
  status?: string;
  error?: string;
}

/**
 * Template status request options
 */
export interface TemplateStatusOptions extends WabaConfig {
  templateId: string;
}

/**
 * Template status response
 */
export interface TemplateStatusResponse {
  success: boolean;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  name?: string;
  category?: string;
  error?: string;
}

/**
 * Delete template request options
 */
export interface DeleteTemplateOptions extends WabaConfig {
  templateId: string;
}

/**
 * Send template message request
 */
export interface SendTemplateMessageRequest extends WabaConfig {
  templateId: string;
  phoneNumber: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
  bodyParameters?: string[];
  /** Type of media in header (image, video, or document), defaults to 'image' */
  mediaType?: 'image' | 'video' | 'document';
  /** Buttons for the message (URL and Quick Reply) */
  buttons?: Array<{
    type: 'url' | 'quickReply';
    text: string;
    url?: string;
    order: number;
  }>;
  /** Document filename (required when mediaType is 'document') */
  documentFilename?: string;
}

/**
 * Carousel card for carousel messages
 */
export interface CarouselCard {
  /** Media URL (image or video) */
  imageUrl: string;
  /** Type of media (image or video), defaults to 'image' */
  mediaType?: 'image' | 'video';
  bodyParameters?: string[];
  /** Buttons for this carousel card (max 2) */
  buttons?: Array<{
    type: 'url' | 'quickReply';
    text: string;
    url?: string;
    order: number;
  }>;
}

/**
 * Send carousel message request
 */
export interface SendCarouselMessageRequest extends WabaConfig {
  templateId: string;
  phoneNumber: string;
  cards: CarouselCard[];
  metadata?: Record<string, unknown>;
  mainBodyParameters?: string[];
  cardBodyParameters?: string[][];
}

/**
 * Send message response
 */
export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Config check result
 */
export interface ConfigCheckResult {
  configured: boolean;
  apiUrl: string;
}
