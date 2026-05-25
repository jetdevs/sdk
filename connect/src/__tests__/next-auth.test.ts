import { describe, it, expect } from 'vitest'
import { YoboConnectProvider } from '../next-auth/index.js'

const config = {
  baseUrl: 'https://connect.yobolabs.ai',
  clientId: 'yobo-merchant',
  clientSecret: 'secret',
}

describe('YoboConnectProvider', () => {
  it('has correct id and type', () => {
    const provider = YoboConnectProvider(config)
    expect(provider.id).toBe('yobo-connect')
    expect(provider.type).toBe('oauth')
  })

  it('sets wellKnown to discovery URL', () => {
    const provider = YoboConnectProvider(config)
    expect(provider.wellKnown).toBe(
      'https://connect.yobolabs.ai/.well-known/openid-configuration',
    )
  })

  it('includes pkce and state checks', () => {
    const provider = YoboConnectProvider(config)
    expect(provider.checks).toContain('pkce')
    expect(provider.checks).toContain('state')
  })

  it('maps profile to NextAuth user shape', () => {
    const provider = YoboConnectProvider(config)
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
    const provider = YoboConnectProvider(config)
    expect((provider.authorization as any)?.params?.scope).toContain('openid')
    expect((provider.authorization as any)?.params?.scope).toContain('offline_access')
  })

  it('uses custom scopes when provided', () => {
    const provider = YoboConnectProvider({ ...config, defaultScopes: ['openid', 'campaign:read'] })
    expect((provider.authorization as any)?.params?.scope).toBe('openid campaign:read')
  })

  it('passes clientId and clientSecret', () => {
    const provider = YoboConnectProvider(config)
    expect(provider.clientId).toBe('yobo-merchant')
    expect(provider.clientSecret).toBe('secret')
  })
})
