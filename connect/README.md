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

### Application disconnect and onboarding identity

Use these methods only on the server with the relying party's internal API key:

```ts
import { ConnectProvisioningClient } from '@jetdevs/connect/server'

const provisioning = new ConnectProvisioningClient({
  baseUrl: process.env.CONNECT_ISSUER_URL!,
  internalApiKey: process.env.CONNECT_INTERNAL_API_KEY!,
})

const receipt = await provisioning.disconnectApplicationIdentity({
  sub: storedConnectSub,
  sourceUserRef: String(localUserId),
})
const binding = await provisioning.getClientOrgBinding({ sub: storedConnectSub })
// For an independently verified signup/invitation flow:
const request = await provisioning.prepareOnboardingIdentity({ state, nonce, codeChallenge })
// After the browser returns a proof code to the configured callback:
const identity = await provisioning.exchangeOnboardingIdentity({
  code, codeVerifier, nonce, state, redirectUri,
})
```

The RP key requires `identity:disconnect` for disconnect, `onboarding:identity`
for prepare/exchange, and `provisioning` for the caller's selected-org binding
read. Disconnect confirms only this application's grants, client bindings and
identity mapping retirement; the receipt preserves the canonical identity and
does not claim global credential, membership or session deletion.

Each method has a 10-second request budget and no automatic retries.
`disconnectTimeoutMs` and `onboardingTimeoutMs` override their respective budgets;
`getClientOrgBinding` always uses 10 seconds. Errors use the exported
`ConnectIdentityDisconnectError`, `ConnectOnboardingIdentityError`, or
`ConnectClientOrgBindingError` classes with stable `code` and `status` fields.

Prepare returns either `not_required` for an eligible preflight, or `required`
with an authorization URL. Exchange consumes a one-use proof: never retry it.
Generate and retain state, nonce and PKCE values on the server, enforce the
browser/callback binding, and verify the returned `clientId` against your RP.
The exchange result is identity evidence only: it grants no business session,
roles, organization access or tokens. The caller must still enforce independent
mailbox proof, local lifecycle and authorization rules. A binding read is only
this caller's current selected organization (`orgId` may be null), not an
access grant.

For every selected-organization **write**, pass the authoritative RP-local user ID:

```ts
await provisioning.setClientOrgBinding({
  sub: storedConnectSub,
  orgId: selectedCanonicalOrgId,
  sourceUserRef: String(localUserId),
})
```

The extra argument is optional for existing callers whose application has never
been disconnected. After an application-scoped retirement, Auth refuses writes
without it (`source_user_ref_required`, HTTP 409), including old requests already
in flight during upgrade. An explicitly deleted local reference is permanently
refused (`ref_conflict`, HTTP 409), even after fresh re-entry. Upgrade **all**
binding writers before enabling scoped retirement. A fresh local reference may
select its organization before `registerIdentity`; a currently registered reference
may change that selection while active canonical membership remains required.
Credential-source `retired_at` is independent of `application_deleted_at`: retiring
password ownership alone does not prohibit a current application's binding write.
These are server checks; never derive the reference from email or browser input.
The existing generic provisioning error contract for this write is unchanged.

Disconnect rejects HTTP redirects, including cross-origin 307/308, before sending
its internal key or identifiers to the destination. Other provisioning methods
retain their existing transport behavior.
