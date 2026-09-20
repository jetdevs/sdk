import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { ConnectProvider, mapConnectClaimsToToken } from '../index.js'
import type { ConnectProviderConfig } from '../index.js'

const config = {
  baseUrl: 'https://connect.example.com',
  clientId: 'example-app',
  clientSecret: 'secret',
}

/**
 * Captured from the built `dist/next-auth/index.js` at 09eebb0, BEFORE this
 * story's edit:
 *
 *   node -e "import('./dist/next-auth/index.js').then(m =>
 *     console.log(JSON.stringify(m.ConnectProvider(config).authorization)))"
 *
 * crm, yobo and cadra-web are live on this provider and configure neither
 * `resource` nor `additionalScopes`, so these two strings are the contract.
 */
const PRE_P79_AUTHORIZATION_DEFAULT =
  '{"params":{"scope":"openid profile email offline_access"}}'
const PRE_P79_AUTHORIZATION_CUSTOM_SCOPES = '{"params":{"scope":"openid campaign:read"}}'

describe('AC1 — cv, aeid and grant_id reach the NextAuth user object (specs.md §10.3)', () => {
  it('carries all three claims off a userinfo payload that has them', () => {
    const provider = ConnectProvider(config)
    const user = provider.profile(
      {
        sub: 'user-uuid-123',
        name: 'Alice',
        email: 'alice@example.com',
        cv: 7,
        aeid: 'epoch-uuid-abc',
        grant_id: 'grant-uuid-xyz',
      },
      {} as never,
    )

    // Presence, not just value — a dropped claim reads as `undefined` on a
    // loose index access and would pass a value-only assertion against
    // `undefined`.
    expect(Object.keys(user)).toEqual(expect.arrayContaining(['cv', 'aeid', 'grant_id']))
    expect(user).toHaveProperty('cv', 7)
    expect(user).toHaveProperty('aeid', 'epoch-uuid-abc')
    expect(user).toHaveProperty('grant_id', 'grant-uuid-xyz')
  })

  it('accepts the camelCase grantId alias', () => {
    const user = ConnectProvider(config).profile(
      { sub: 'user-uuid-123', grantId: 'grant-uuid-xyz' },
      {} as never,
    )
    expect(user).toHaveProperty('grant_id', 'grant-uuid-xyz')
  })

  it('omits the keys entirely when the IdP sends no epoch claims', () => {
    const user = ConnectProvider(config).profile({ sub: 'user-uuid-123' }, {} as never)
    expect(Object.keys(user)).not.toContain('cv')
    expect(Object.keys(user)).not.toContain('aeid')
    expect(Object.keys(user)).not.toContain('grant_id')
  })

  it('keeps cv === 0 rather than dropping it as falsy', () => {
    const user = ConnectProvider(config).profile({ sub: 's', cv: 0 }, {} as never)
    expect(user).toHaveProperty('cv', 0)
  })
})

describe('AC2 — the issuer is available alongside the subject', () => {
  it('exposes connectIssuer and connectSub so the consumer can form (issuer, sub)', () => {
    const user = ConnectProvider(config).profile({ sub: 'user-uuid-123' }, {} as never)
    expect(Object.keys(user)).toEqual(expect.arrayContaining(['connectIssuer', 'connectSub']))
    expect(user).toHaveProperty('connectSub', 'user-uuid-123')
    // Falls back to the configured baseUrl — a plain /userinfo response carries
    // no `iss`.
    expect(user).toHaveProperty('connectIssuer', 'https://connect.example.com')
  })

  // The retired contract (through 95bd4bd) preferred `profile.iss`. It is the
  // response body: `iss: ''` survived the `??` and produced an empty issuer,
  // and any other value was taken verbatim — for the one field whose job is to
  // be a trust anchor.
  it('ignores a payload iss and keeps the configured baseUrl', () => {
    const user = ConnectProvider(config).profile(
      { sub: 'user-uuid-123', iss: 'https://evil.example' },
      {} as never,
    )
    expect(user.connectIssuer).toBe('https://connect.example.com')
  })

  it('is not emptied by an empty-string iss', () => {
    const user = ConnectProvider(config).profile({ sub: 's', iss: '' }, {} as never)
    expect(user.connectIssuer).toBe('https://connect.example.com')
  })

  it('leaves user.id on profile.sub — crm and yobo resolve by it today', () => {
    const user = ConnectProvider(config).profile({ sub: 'user-uuid-123' }, {} as never)
    expect(user.id).toBe('user-uuid-123')
  })
})

describe('AC3 — no resource and no scope configured ⇒ byte-identical authorization params', () => {
  it('matches the pre-p79 bytes on the default config', () => {
    const provider = ConnectProvider(config)
    expect(JSON.stringify(provider.authorization)).toBe(PRE_P79_AUTHORIZATION_DEFAULT)
  })

  it('matches the pre-p79 bytes with custom defaultScopes', () => {
    const provider = ConnectProvider({ ...config, defaultScopes: ['openid', 'campaign:read'] })
    expect(JSON.stringify(provider.authorization)).toBe(PRE_P79_AUTHORIZATION_CUSTOM_SCOPES)
  })

  it('sends no resource parameter at all, not an empty one', () => {
    const params = (ConnectProvider(config).authorization as { params: Record<string, string> })
      .params
    expect(Object.keys(params)).toEqual(['scope'])
  })

  it('is byte-identical when additionalScopes is present but empty', () => {
    const provider = ConnectProvider({ ...config, additionalScopes: [] })
    expect(JSON.stringify(provider.authorization)).toBe(PRE_P79_AUTHORIZATION_DEFAULT)
  })
})

describe('AC4 — a configured resource and scope both appear as request parameters (specs.md §12.1a)', () => {
  const copilot = {
    ...config,
    resource: 'https://app.cadraos.com/copilot',
    additionalScopes: ['copilot:use'],
  }

  it('sends the resource indicator', () => {
    const params = (ConnectProvider(copilot).authorization as { params: Record<string, string> })
      .params
    expect(params.resource).toBe('https://app.cadraos.com/copilot')
  })

  it('appends the extra scope to the identity scopes', () => {
    const params = (ConnectProvider(copilot).authorization as { params: Record<string, string> })
      .params
    expect(params.scope).toBe('openid profile email offline_access copilot:use')
  })

  const scopeOf = (cfg: ConnectProviderConfig) =>
    (ConnectProvider(cfg).authorization as { params: Record<string, string> }).params.scope

  it('does not repeat a scope already in defaultScopes', () => {
    expect(scopeOf({ ...config, additionalScopes: ['openid', 'copilot:use'] })).toBe(
      'openid profile email offline_access copilot:use',
    )
  })

  it('does not repeat a scope additionalScopes lists twice', () => {
    expect(scopeOf({ ...config, additionalScopes: ['copilot:use', 'copilot:use'] })).toBe(
      'openid profile email offline_access copilot:use',
    )
  })

  it('drops an empty scope rather than emitting a double separator', () => {
    expect(scopeOf({ ...config, additionalScopes: [''] })).toBe(
      'openid profile email offline_access',
    )
    expect(scopeOf({ ...config, additionalScopes: ['', 'copilot:use'] })).toBe(
      'openid profile email offline_access copilot:use',
    )
  })

  it('keeps the base list first and in order', () => {
    expect(scopeOf({ ...config, additionalScopes: ['copilot:use', 'openid'] })).toBe(
      'openid profile email offline_access copilot:use',
    )
  })
})

describe('§12.1a — the resource reaches the TOKEN request, not only /authorize', () => {
  const resource = 'https://app.cadraos.com/copilot'

  /** Stand-in for the openid-client instance NextAuth hands the handler. */
  function fakeClient() {
    const calls: unknown[][] = []
    return {
      calls,
      client: {
        callback: (...args: unknown[]) => {
          calls.push(args)
          return { access_token: 'at', id_token: 'it' }
        },
      },
    }
  }

  async function exchange(cfg: ConnectProviderConfig) {
    const provider = ConnectProvider(cfg)
    const { client, calls } = fakeClient()
    const handler = provider.token as {
      request: (ctx: Record<string, unknown>) => Promise<{ tokens: unknown }>
    }
    const result = await handler.request({
      client,
      provider: { ...provider, callbackUrl: 'https://rp.example/api/auth/callback/connect' },
      params: { code: 'the-code', state: 'the-state' },
      checks: { code_verifier: 'the-verifier', state: 'the-state', nonce: 'the-nonce' },
    })
    return { calls, result }
  }

  it('installs no token handler at all when no resource is configured', () => {
    // AC3: with nothing configured the provider object itself is unchanged.
    expect(Object.keys(ConnectProvider(config))).not.toContain('token')
  })

  it('sends the resource in the exchange BODY, not as a callback parameter', async () => {
    // A resource on `authorization.params` alone leaves the access token
    // identity-bound with no audience: NextAuth merges `token.params` into the
    // callback parameters and openid-client drops every non-callback key before
    // building the exchange body. `extras.exchangeBody` is the only way in.
    const { calls } = await exchange({ ...config, resource })
    expect(calls).toHaveLength(1)
    expect(calls[0][3]).toEqual({ exchangeBody: { resource } })
    expect(calls[0][1]).not.toHaveProperty('resource')
  })

  it('leaves the redirect uri, callback params and checks untouched', async () => {
    const { calls, result } = await exchange({ ...config, resource })
    expect(calls[0][0]).toBe('https://rp.example/api/auth/callback/connect')
    expect(calls[0][1]).toEqual({ code: 'the-code', state: 'the-state' })
    // PKCE/state/nonce must reach openid-client exactly as NextAuth built them.
    expect(calls[0][2]).toEqual({
      code_verifier: 'the-verifier',
      state: 'the-state',
      nonce: 'the-nonce',
    })
    expect(result.tokens).toEqual({ access_token: 'at', id_token: 'it' })
  })
})

describe('AC5 — PKCE, state and nonce remain enabled and unmodified', () => {
  it('declares exactly the three checks, in order', () => {
    expect(ConnectProvider(config).checks).toEqual(['pkce', 'state', 'nonce'])
  })

  it('still declares them in the source, not only in the returned object', () => {
    const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
    expect(source).toContain("checks: ['pkce', 'state', 'nonce'],")
  })
})

describe('mapConnectClaimsToToken carries the same claims onto the JWT', () => {
  it('copies the epoch claims and the issuer', () => {
    const token: Record<string, unknown> = {}
    mapConnectClaimsToToken(token, {
      account: { provider: 'connect' },
      issuer: 'https://connect.example.com',
      profile: {
        sub: 'user-uuid-123',
        cv: 7,
        aeid: 'epoch-uuid-abc',
        grant_id: 'grant-uuid-xyz',
      },
    })
    expect(Object.keys(token)).toEqual(
      expect.arrayContaining(['connectCv', 'connectAeid', 'connectGrantId', 'connectIssuer']),
    )
    expect(token).toHaveProperty('connectCv', 7)
    expect(token).toHaveProperty('connectAeid', 'epoch-uuid-abc')
    expect(token).toHaveProperty('connectGrantId', 'grant-uuid-xyz')
    expect(token).toHaveProperty('connectIssuer', 'https://connect.example.com')
    expect(token).toHaveProperty('connectSub', 'user-uuid-123')
  })

  it('prefers the configured issuer over one asserted in the payload', () => {
    const token: Record<string, unknown> = {}
    mapConnectClaimsToToken(token, {
      account: { provider: 'connect' },
      issuer: 'https://connect.example.com',
      profile: { sub: 's', iss: 'https://evil.example' },
    })
    expect(token.connectIssuer).toBe('https://connect.example.com')
  })

  it('falls back to the payload iss only when the caller configured none', () => {
    const token: Record<string, unknown> = {}
    mapConnectClaimsToToken(token, {
      account: { provider: 'connect' },
      profile: { sub: 's', iss: 'https://connect.cadraos.com' },
    })
    expect(token.connectIssuer).toBe('https://connect.cadraos.com')
  })

  it('clears an epoch the IdP has stopped asserting (no fail-open on refresh)', () => {
    const token: Record<string, unknown> = {
      connectCv: 7,
      connectAeid: 'epoch-uuid-abc',
      connectGrantId: 'grant-uuid-xyz',
      connectOrgId: 42,
    }
    mapConnectClaimsToToken(token, {
      account: { provider: 'connect' },
      issuer: 'https://connect.example.com',
      profile: { sub: 'user-uuid-123' },
    })
    // Absence means "not asserted", not "unchanged" — a stale cv surviving a
    // re-authentication is the fail-open STORY-014 enforcement would read.
    expect(Object.keys(token)).not.toContain('connectCv')
    expect(Object.keys(token)).not.toContain('connectAeid')
    expect(Object.keys(token)).not.toContain('connectGrantId')
    // Org state is resolved state, not an enforcement input: it is left alone.
    expect(token).toHaveProperty('connectOrgId', 42)
  })

  it('leaves a non-Connect provider token untouched, epoch keys included', () => {
    const token: Record<string, unknown> = { connectCv: 7 }
    mapConnectClaimsToToken(token, {
      account: { provider: 'google' },
      profile: { sub: 's' },
    })
    expect(token).toHaveProperty('connectCv', 7)
  })

  it('stays a no-op for a non-Connect provider', () => {
    const token: Record<string, unknown> = {}
    mapConnectClaimsToToken(token, {
      account: { provider: 'google' },
      issuer: 'https://connect.example.com',
      profile: { sub: 's', cv: 7, aeid: 'e', grant_id: 'g' },
    })
    expect(Object.keys(token)).toEqual([])
  })

  it('writes no epoch keys when the IdP sent no epoch claims', () => {
    const token: Record<string, unknown> = {}
    mapConnectClaimsToToken(token, {
      account: { provider: 'connect' },
      profile: { sub: 'user-uuid-123' },
    })
    expect(Object.keys(token)).toEqual(['connectSub'])
  })
})
