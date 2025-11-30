/**
 * Instagram OAuth Provider
 *
 * Custom Instagram OAuth configuration for NextAuth.js
 * with support for user profile and media access.
 */

import type { OAuthConfig, OAuthUserConfig } from 'next-auth/providers/oauth';
import type { InstagramProfile } from '../types';

export default function InstagramProvider<P extends InstagramProfile>(
  options: OAuthUserConfig<P>
): OAuthConfig<P> {
  return {
    id: 'instagram',
    name: 'Instagram',
    type: 'oauth',
    version: '2.0',
    authorization: {
      url: 'https://api.instagram.com/oauth/authorize',
      params: {
        scope: 'user_profile,user_media',
      },
    },
    token: 'https://api.instagram.com/oauth/access_token',
    userinfo: {
      url: 'https://graph.instagram.com/me',
      params: { fields: 'id,username,account_type,media_count' },
    },
    profile(profile: InstagramProfile) {
      return {
        id: profile.id,
        name: profile.username,
        email: null, // Instagram doesn't provide email
      };
    },
    style: {
      logo: '/instagram.svg',
      logoDark: '/instagram-dark.svg',
      bg: '#fff',
      text: '#E4405F',
      bgDark: '#E4405F',
      textDark: '#fff',
    },
    options,
  };
}

export { InstagramProvider };
export type { InstagramProfile } from '../types';
