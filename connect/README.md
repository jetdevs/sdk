# @jetdevs/connect

A brand-neutral **OIDC Relying-Party (RP) client SDK**. Use it to add "Connect" SSO
(OpenID Connect) against any compatible identity provider — the IdP base URL, client
credentials, and branding all live in **your** configuration, never in the SDK.

## Entry points

| Import | Use |
|--------|-----|
| `@jetdevs/connect` | shared types (`ConnectConfig`, `TokenSet`, `ConnectUserinfo`, …) |
| `@jetdevs/connect/server` | `ConnectClient` (low-level OIDC RP), `ConnectProvisioningClient` |
| `@jetdevs/connect/next-auth` | `ConnectProvider` (drop-in NextAuth v4 provider) + session helpers |
| `@jetdevs/connect/browser` | `initiateSignIn` / `initiateSignOut` client helpers |

## NextAuth provider

```ts
// app/api/auth/[...nextauth]/route.ts
import { ConnectProvider } from '@jetdevs/connect/next-auth'

export default NextAuth({
  providers: [
    ConnectProvider({
      baseUrl: process.env.CONNECT_ISSUER_URL!,
      clientId: process.env.CONNECT_CLIENT_ID!,
      clientSecret: process.env.CONNECT_CLIENT_SECRET!,
      // Optional branding — defaults to id:'connect', name:'Connect':
      // id: 'acme-connect',
      // name: 'Acme Connect',
    }),
  ],
})
```

The `id` doubles as the sign-in route slug (`/api/auth/signin/<id>`). When you brand
the provider, pass the same id to the browser helper and the session mapper:

```ts
import { initiateSignIn } from '@jetdevs/connect/browser'
initiateSignIn({ providerId: 'acme-connect', returnTo: '/dashboard' })

import { mapConnectClaimsToToken } from '@jetdevs/connect/next-auth'
mapConnectClaimsToToken(token, { account, profile, providerId: 'acme-connect' })
```

## Low-level client

```ts
import { ConnectClient } from '@jetdevs/connect/server'

const client = new ConnectClient({
  baseUrl: process.env.CONNECT_ISSUER_URL!,
  clientId: process.env.CONNECT_CLIENT_ID!,
  clientSecret: process.env.CONNECT_CLIENT_SECRET,
  redirectUri: 'https://app.example.com/auth/callback',
})

const { url, codeVerifier, state, nonce } = await client.buildAuthorizationUrl()
// …redirect, then on callback:
const tokens = await client.exchangeCode(code, codeVerifier)
const user = await client.getUserinfo(tokens.accessToken)
```

`ConnectClient` handles discovery (cached), PKCE, token exchange/refresh, userinfo,
id-token verification, introspection, and revocation.

## Provisioning (server-only)

`ConnectProvisioningClient` mirrors local users/orgs/memberships into the IdP's
canonical directory via its internal API (carries an `X-Internal-API-Key` — never
import from browser code). Each RP identifies itself with a free-form `sourceSystem`
key.
