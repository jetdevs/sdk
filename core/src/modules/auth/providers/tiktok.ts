/**
 * TikTok OAuth Provider
 *
 * Custom TikTok OAuth configuration for NextAuth.js
 * with support for user profile and video access.
 *
 * Note: TikTok uses client_key instead of client_id
 */

import type { OAuthConfig, OAuthUserConfig } from 'next-auth/providers/oauth';
import type { TikTokProfile } from '../types';

export default function TikTokProvider<P extends TikTokProfile>(
  options: OAuthUserConfig<P>
): OAuthConfig<P> {
  return {
    id: 'tiktok',
    name: 'TikTok',
    type: 'oauth',
    version: '2.0',
    authorization: {
      url: 'https://www.tiktok.com/auth/authorize/',
      params: {
        scope: 'user.info.basic,video.list',
        response_type: 'code',
      },
    },
    token: {
      url: 'https://open-api.tiktok.com/oauth/access_token/',
      // TikTok requires client_key instead of client_id
      async request(context) {
        const tokenUrl = 'https://open-api.tiktok.com/oauth/access_token/';
        const params = {
          client_key: context.provider.clientId,
          client_secret: context.provider.clientSecret,
          code: context.params.code,
          grant_type: 'authorization_code',
        };

        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(params as Record<string, string>),
        });

        const data = await response.json();
        return { tokens: data.data };
      },
    },
    userinfo: {
      url: 'https://open-api.tiktok.com/oauth/userinfo/',
      async request(context) {
        const userinfoUrl = 'https://open-api.tiktok.com/oauth/userinfo/';
        const response = await fetch(userinfoUrl, {
          headers: {
            Authorization: `Bearer ${context.tokens.access_token}`,
          },
        });
        const data = await response.json();
        return data.data.user;
      },
    },
    profile(profile: TikTokProfile) {
      return {
        id: profile.open_id,
        name: profile.display_name,
        image: profile.avatar_large_url,
      };
    },
    style: {
      logo: '/tiktok.svg',
      logoDark: '/tiktok-dark.svg',
      bg: '#fff',
      text: '#000',
      bgDark: '#000',
      textDark: '#fff',
    },
    options,
  };
}

export { TikTokProvider };
export type { TikTokProfile } from '../types';
