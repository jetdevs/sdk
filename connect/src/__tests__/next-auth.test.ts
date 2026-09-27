import { describe, it, expect } from 'vitest'
import { ConnectProvider } from '../next-auth/index.js'

const config = {
  baseUrl: 'https://connect.example.com',
  clientId: 'example-app',
  clientSecret: 'secret',
}

describe('ConnectProvider', () => {
  it('has correct default id and type', () => {
    const provider = ConnectProvider(config)
    expect(provider.id).toBe('connect')
    // NextAuth v4 OIDC providers are typed `oauth` + wellKnown + idToken.
    expect(provider.type).toBe('oauth')
  })

  it('uses the default display name', () => {
    const provider = ConnectProvider(config)
    expect(provider.name).toBe('Connect')
  })

  it('allows branding the provider id and name', () => {
    const provider = ConnectProvider({ ...config, id: 'acme-connect', name: 'Acme Connect' })
    expect(provider.id).toBe('acme-connect')
    expect(provider.name).toBe('Acme Connect')
  })

  it('enables idToken validation for OIDC', () => {
    const provider = ConnectProvider(config)
    expect(provider.idToken).toBe(true)
  })

  it('sets wellKnown to discovery URL', () => {
    const provider = ConnectProvider(config)
    expect(provider.wellKnown).toBe(
      'https://connect.example.com/.well-known/openid-configuration',
    )
  })

  it('includes pkce and state checks', () => {
    const provider = ConnectProvider(config)
    expect(provider.checks).toContain('pkce')
    expect(provider.checks).toContain('state')
  })

  it('includes nonce check for ID token replay protection', () => {
    const provider = ConnectProvider(config)
    expect(provider.checks).toContain('nonce')
  })

  it('maps profile to NextAuth user shape', () => {
    const provider = ConnectProvider(config)
    const profile = {
      sub: 'user-uuid-123',
      name: 'Alice',
      email: 'alice@example.com',
      picture: 'https://cdn.example.com/avatar.png',
      orgId: 5,
      orgRole: 'admin' as const,
    }
    // profile() is called by NextAuth internally — it should return { id, name, email, image }
    const user = provider.profile!(profile, {} as any)
    expect(user.id).toBe('user-uuid-123')
    expect(user.name).toBe('Alice')
    expect(user.email).toBe('alice@example.com')
    expect(user.image).toBe('https://cdn.example.com/avatar.png')
  })

  it('uses default scopes when not specified', () => {
    const provider = ConnectProvider(config)
    expect((provider.authorization as any)?.params?.scope).toContain('openid')
    expect((provider.authorization as any)?.params?.scope).toContain('offline_access')
  })

  it('uses custom scopes when provided', () => {
    const provider = ConnectProvider({ ...config, defaultScopes: ['openid', 'campaign:read'] })
    expect((provider.authorization as any)?.params?.scope).toBe('openid campaign:read')
  })

  it('passes clientId and clientSecret', () => {
    const provider = ConnectProvider(config)
    expect(provider.clientId).toBe('example-app')
    expect(provider.clientSecret).toBe('secret')
  })
})
