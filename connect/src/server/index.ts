import { randomBytes } from 'crypto'
import { generateCodeVerifier, generateCodeChallenge } from './pkce.js'
import { DiscoveryCache, fetchDiscovery } from './discovery.js'
import { verifyIdToken as verifyIdTokenJwt } from './jwks.js'
import type {
  ConnectConfig,
  TokenSet,
  ConnectUserinfo,
  ConnectIdTokenClaims,
  OidcDiscovery,
  AuthorizationParams,
  AuthorizationResult,
  IntrospectionResponse,
} from '../types/index.js'

type ResolvedConfig = Required<Pick<ConnectConfig, 'defaultScopes' | 'discoveryTtlMs'>> & ConnectConfig

export class YoboConnect {
  private readonly cfg: ResolvedConfig
  private readonly cache: DiscoveryCache

  constructor(config: ConnectConfig) {
    this.cfg = {
      defaultScopes: ['openid', 'profile', 'email'],
      discoveryTtlMs: 3_600_000,
      ...config,
    }
    this.cache = new DiscoveryCache()
  }

  async getDiscovery(): Promise<OidcDiscovery> {
    return fetchDiscovery(this.cfg.baseUrl, this.cache, this.cfg.discoveryTtlMs)
  }

  async buildAuthorizationUrl(params: AuthorizationParams = {}): Promise<AuthorizationResult> {
    const discovery = await this.getDiscovery()
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    const state = params.state ?? randomBytes(16).toString('base64url')
    const nonce = params.nonce ?? randomBytes(16).toString('base64url')
    const scopes = params.scopes ?? this.cfg.defaultScopes

    const url = new URL(discovery.authorization_endpoint)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', this.cfg.clientId)
    url.searchParams.set('redirect_uri', this.cfg.redirectUri)
    url.searchParams.set('scope', scopes.join(' '))
    url.searchParams.set('state', state)
    url.searchParams.set('nonce', nonce)
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    if (params.resource) url.searchParams.set('resource', params.resource)
    if (params.prompt) url.searchParams.set('prompt', params.prompt)

    return { url: url.toString(), codeVerifier, state, nonce }
  }

  async exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri?: string,
  ): Promise<TokenSet> {
    const discovery = await this.getDiscovery()
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri ?? this.cfg.redirectUri,
      code_verifier: codeVerifier,
      client_id: this.cfg.clientId,
    })
    if (this.cfg.clientSecret) body.set('client_secret', this.cfg.clientSecret)
    return this.postToken(discovery.token_endpoint, body)
  }

  async refreshTokens(refreshToken: string, scopeSubset?: string[]): Promise<TokenSet> {
    const discovery = await this.getDiscovery()
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.cfg.clientId,
    })
    if (this.cfg.clientSecret) body.set('client_secret', this.cfg.clientSecret)
    if (scopeSubset?.length) body.set('scope', scopeSubset.join(' '))
    return this.postToken(discovery.token_endpoint, body)
  }

  async revokeToken(
    token: string,
    tokenTypeHint?: 'access_token' | 'refresh_token',
  ): Promise<void> {
    const discovery = await this.getDiscovery()
    if (!discovery.revocation_endpoint) {
      throw new Error('Yobo Connect did not advertise a revocation_endpoint')
    }
    const body = new URLSearchParams({ token, client_id: this.cfg.clientId })
    if (tokenTypeHint) body.set('token_type_hint', tokenTypeHint)
    if (this.cfg.clientSecret) body.set('client_secret', this.cfg.clientSecret)

    const res = await fetch(discovery.revocation_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(`Revoke failed ${res.status}: ${json.error ?? 'unknown_error'}`)
    }
  }

  async getUserinfo(accessToken: string): Promise<ConnectUserinfo> {
    const discovery = await this.getDiscovery()
    const res = await fetch(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Userinfo request failed: HTTP ${res.status} from ${discovery.userinfo_endpoint}`)
    return res.json() as Promise<ConnectUserinfo>
  }

  async verifyIdToken(idToken: string, nonce?: string): Promise<ConnectIdTokenClaims> {
    const discovery = await this.getDiscovery()
    return verifyIdTokenJwt(idToken, discovery, this.cfg.clientId, nonce)
  }

  async introspect(token: string): Promise<IntrospectionResponse> {
    const discovery = await this.getDiscovery()
    if (!discovery.introspection_endpoint) {
      throw new Error('Yobo Connect did not advertise an introspection_endpoint')
    }
    const body = new URLSearchParams({ token, client_id: this.cfg.clientId })
    if (this.cfg.clientSecret) body.set('client_secret', this.cfg.clientSecret)

    const res = await fetch(discovery.introspection_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) throw new Error(`Introspect failed: HTTP ${res.status}`)
    return res.json() as Promise<IntrospectionResponse>
  }

  private async postToken(endpoint: string, body: URLSearchParams): Promise<TokenSet> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(`Token request failed ${res.status}: ${json.error ?? 'unknown_error'}`)
    }
    const data = await res.json() as {
      access_token: string
      refresh_token?: string
      id_token?: string
      token_type: string
      expires_in?: number
      scope?: string
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      tokenType: data.token_type ?? 'Bearer',
      expiresIn: data.expires_in,
      scope: data.scope,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    }
  }
}
