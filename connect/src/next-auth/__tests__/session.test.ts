import { describe, it, expect } from 'vitest'
import {
  mapConnectClaimsToToken,
  applyConnectOrgToSession,
} from '../session.js'

describe('mapConnectClaimsToToken', () => {
  it('copies org_id/org_role/sub from a yobo-connect profile into the token', () => {
    const token: Record<string, unknown> = {}
    mapConnectClaimsToToken(token, {
      account: { provider: 'yobo-connect' },
      profile: {
        sub: 'user-uuid-123',
        org_id: 5,
        org_role: 'admin',
      } as any,
    })
    expect(token.connectSub).toBe('user-uuid-123')
    expect(token.connectOrgId).toBe(5)
    expect(token.connectOrgRole).toBe('admin')
  })

  it('is a no-op for non-yobo-connect providers', () => {
    const token: Record<string, unknown> = {}
    mapConnectClaimsToToken(token, {
      account: { provider: 'google' },
      profile: {
        sub: 'user-uuid-123',
        org_id: 5,
        org_role: 'admin',
      } as any,
    })
    expect(token.connectSub).toBeUndefined()
    expect(token.connectOrgId).toBeUndefined()
    expect(token.connectOrgRole).toBeUndefined()
  })

  it('tolerates a missing org_id (system/global user → no org claim, but sub still copied)', () => {
    const token: Record<string, unknown> = {}
    mapConnectClaimsToToken(token, {
      account: { provider: 'yobo-connect' },
      profile: {
        sub: 'system-user-1',
      } as any,
    })
    expect(token.connectSub).toBe('system-user-1')
    expect(token.connectOrgId).toBeUndefined()
    expect(token.connectOrgRole).toBeUndefined()
  })
})

describe('applyConnectOrgToSession', () => {
  it('sets currentOrgId+orgId+connectOrgRole from a resolved localOrgId', () => {
    const session = { user: {} as Record<string, unknown> }
    applyConnectOrgToSession(session, { localOrgId: 42, orgRole: 'owner' })
    expect(session.user.currentOrgId).toBe(42)
    expect(session.user.orgId).toBe(42)
    expect(session.user.connectOrgRole).toBe('owner')
  })

  it('leaves currentOrgId unset when localOrgId is null', () => {
    const session = { user: {} as Record<string, unknown> }
    applyConnectOrgToSession(session, { localOrgId: null, orgRole: null })
    expect(session.user.currentOrgId).toBeUndefined()
    expect(session.user.orgId).toBeUndefined()
    expect(session.user.connectOrgRole).toBeUndefined()
  })
})
