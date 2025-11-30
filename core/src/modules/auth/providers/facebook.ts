/**
 * Facebook OAuth Provider
 *
 * Custom Facebook OAuth configuration for NextAuth.js
 * with support for Pages API and extended profile data.
 */

import type { OAuthConfig, OAuthUserConfig } from 'next-auth/providers/oauth';
import type { FacebookProfile } from '../types';

export default function FacebookProvider<P extends FacebookProfile>(
  options: OAuthUserConfig<P>
): OAuthConfig<P> {
  return {
    id: 'facebook',
    name: 'Facebook',
    type: 'oauth',
    version: '2.0',
    authorization: {
      url: 'https://www.facebook.com/v18.0/dialog/oauth',
      params: {
        scope: 'email public_profile pages_show_list pages_read_engagement pages_manage_posts',
      },
    },
    token: 'https://graph.facebook.com/oauth/access_token',
    userinfo: {
      url: 'https://graph.facebook.com/me',
      params: { fields: 'id,name,email,picture' },
    },
    profile(profile: FacebookProfile) {
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        image: profile.picture?.data.url,
      };
    },
    style: {
      logo: '/facebook.svg',
      logoDark: '/facebook-dark.svg',
      bg: '#fff',
      text: '#1877f2',
      bgDark: '#1877f2',
      textDark: '#fff',
    },
    options,
  };
}

export { FacebookProvider };
export type { FacebookProfile } from '../types';
