/**
 * OAuth Providers
 *
 * Custom OAuth provider configurations for NextAuth.js
 */

export { default as FacebookProvider, FacebookProvider as createFacebookProvider } from './facebook';
export { default as InstagramProvider, InstagramProvider as createInstagramProvider } from './instagram';
export { default as TikTokProvider, TikTokProvider as createTikTokProvider } from './tiktok';

export type { FacebookProfile, InstagramProfile, TikTokProfile } from '../types';
