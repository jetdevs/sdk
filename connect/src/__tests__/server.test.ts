import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { YoboConnect } from '../server/index.js'

const MOCK_DISCOVERY = {
  issuer: 'https://connect.yobolabs.ai',
  authorization_endpoint: 'https://connect.yobolabs.ai/oauth/authorize',
  token_endpoint: 'https://connect.yobolabs.ai/oauth/token',
  userinfo_endpoint: 'https://connect.yobolabs.ai/userinfo',
  jwks_uri: 'https://connect.yobolabs.ai/.well-known/jwks.json',
  revocation_endpoint: 'https://connect.yobolabs.ai/oauth/revoke',
  introspection_endpoint: 'https://connect.yobolabs.ai/oauth/introspect',
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
}

const MOCK_TOKEN_RESPONSE = {
  access_token: 'access-opaque-token',
  refresh_token: 'refresh-opaque-token',
  id_token: 'eyJhbGciOiJSUzI1NiJ9.stub.stub',
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'openid profile email',
}

function makeFetchMock(responses: Array<unknown>) {
  let call = 0
  return vi.fn().mockImplementation(() => {
    const body = responses[call++ % responses.length]
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    })
  })
}

describe('YoboConnect', () => {
  let client: YoboConnect
  const originalFetch = global.fetch

  beforeEach(() => {
    client = new YoboConnect({
      baseUrl: 'https://connect.yobolabs.ai',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      redirectUri: 'https://app.example.com/auth/callback',
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('getDiscovery', () => {
    it('fetches and returns the discovery document', async () => {
      global.fetch = makeFetchMock([MOCK_DISCOVERY])
      const doc = await client.getDiscovery()
      expect(doc.issuer).toBe('https://connect.yobolabs.ai')
      expect(doc.token_endpoint).toBe('https://connect.yobolabs.ai/oauth/token')
      expect(global.fetch).toHaveBeenCalledWith(
        'https://connect.yobolabs.ai/.well-known/openid-configuration',
      )
    })

    it('caches the discovery document (only one fetch)', async () => {
      global.fetch = makeFetchMock([MOCK_DISCOVERY])
      await client.getDiscovery()
      await client.getDiscovery()
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('buildAuthorizationUrl', () => {
    it('returns a URL with required PKCE + OIDC params', async () => {
      global.fetch = makeFetchMock([MOCK_DISCOVERY])
      const result = await client.buildAuthorizationUrl()

      const url = new URL(result.url)
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('client_id')).toBe('test-client')
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
      expect(url.searchParams.get('code_challenge')).toBeTruthy()
      expect(url.searchParams.get('state')).toBeTruthy()
      expect(url.searchParams.get('nonce')).toBeTruthy()
      expect(result.codeVerifier).toBeTruthy()
      expect(result.state).toBeTruthy()
      expect(result.nonce).toBeTruthy()
    })

    it('includes resource parameter when provided', async () => {
      global.fetch = makeFetchMock([MOCK_DISCOVERY])
      const result = await client.buildAuthorizationUrl({ resource: 'yobo-merchant-api' })
      const url = new URL(result.url)
      expect(url.searchParams.get('resource')).toBe('yobo-merchant-api')
    })

    it('uses custom scopes when provided', async () => {
      global.fetch = makeFetchMock([MOCK_DISCOVERY])
      const result = await client.buildAuthorizationUrl({
        scopes: ['openid', 'campaign:read'],
      })
      const url = new URL(result.url)
      expect(url.searchParams.get('scope')).toBe('openid campaign:read')
    })
  })

  describe('exchangeCode', () => {
    it('posts to token endpoint with correct params and returns TokenSet', async () => {
      global.fetch = makeFetchMock([MOCK_DISCOVERY, MOCK_TOKEN_RESPONSE])
      const tokens = await client.exchangeCode('auth-code-xyz', 'verifier-xyz')

      expect(tokens.accessToken).toBe('access-opaque-token')
      expect(tokens.refreshToken).toBe('refresh-opaque-token')
      expect(tokens.expiresIn).toBe(3600)
      expect(tokens.expiresAt).toBeGreaterThan(Date.now())

      const [, tokenCall] = vi.mocked(global.fetch).mock.calls
      const body = new URLSearchParams(tokenCall[1]?.body as string)
      expect(body.get('grant_type')).toBe('authorization_code')
      expect(body.get('code')).toBe('auth-code-xyz')
      expect(body.get('code_verifier')).toBe('verifier-xyz')
      expect(body.get('client_secret')).toBe('test-secret')
    })
  })

  describe('refreshTokens', () => {
    it('posts refresh_token grant and returns new TokenSet', async () => {
      global.fetch = makeFetchMock([MOCK_DISCOVERY, MOCK_TOKEN_RESPONSE])
      const tokens = await client.refreshTokens('old-refresh-token')

      expect(tokens.accessToken).toBe('access-opaque-token')
      const [, tokenCall] = vi.mocked(global.fetch).mock.calls
      const body = new URLSearchParams(tokenCall[1]?.body as string)
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('refresh_token')).toBe('old-refresh-token')
    })
  })

  describe('revokeToken', () => {
    it('posts to revocation endpoint', async () => {
      let call = 0
      global.fetch = vi.fn().mockImplementation(() => {
        const body = call++ === 0 ? MOCK_DISCOVERY : {}
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') })
      })

      await client.revokeToken('some-token', 'refresh_token')

      const [, revokeCall] = vi.mocked(global.fetch).mock.calls
      const body = new URLSearchParams(revokeCall[1]?.body as string)
      expect(body.get('token')).toBe('some-token')
      expect(body.get('token_type_hint')).toBe('refresh_token')
    })
  })

  describe('getUserinfo', () => {
    it('calls userinfo endpoint with Bearer token', async () => {
      const mockUserinfo = { sub: 'user-123', email: 'test@example.com', orgId: 1 }
      let call = 0
      global.fetch = vi.fn().mockImplementation(() => {
        const body = call++ === 0 ? MOCK_DISCOVERY : mockUserinfo
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
      })

      const info = await client.getUserinfo('access-token')
      expect(info.sub).toBe('user-123')
      expect(info.email).toBe('test@example.com')

      const [, userinfoCall] = vi.mocked(global.fetch).mock.calls
      expect(userinfoCall[1]?.headers).toMatchObject({
        Authorization: 'Bearer access-token',
      })
    })
  })

  describe('error handling', () => {
    it('throws on non-ok discovery response', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })
      await expect(client.getDiscovery()).rejects.toThrow('HTTP 503')
    })

    it('throws on non-ok token response', async () => {
      let call = 0
      global.fetch = vi.fn().mockImplementation(() => {
        if (call++ === 0) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MOCK_DISCOVERY) })
        return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: 'invalid_client' }) })
      })
      await expect(client.exchangeCode('bad-code', 'bad-verifier')).rejects.toThrow('invalid_client')
    })
  })

  describe('introspect', () => {
    it('throws when no introspection_endpoint is advertised', async () => {
      const { introspection_endpoint, ...discoveryNoIntrospect } = MOCK_DISCOVERY
      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(discoveryNoIntrospect) }),
      )
      await expect(client.introspect('some-token')).rejects.toThrow('introspection_endpoint')
    })
  })
})
