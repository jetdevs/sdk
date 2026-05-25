import { describe, it, expect } from 'vitest'
import { generateCodeVerifier, generateCodeChallenge, verifyCodeChallenge } from '../server/pkce.js'

describe('PKCE', () => {
  it('generateCodeVerifier produces a base64url string of correct length', () => {
    const v = generateCodeVerifier()
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/)
    // 32 random bytes → 43 base64url chars (no padding)
    expect(v.length).toBe(43)
  })

  it('generateCodeChallenge returns S256 of verifier', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    // SHA-256 of that verifier base64url-encoded
    // Precomputed: E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
    const challenge = generateCodeChallenge(verifier)
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('verifyCodeChallenge accepts correct verifier', () => {
    const v = generateCodeVerifier()
    const c = generateCodeChallenge(v)
    expect(verifyCodeChallenge(v, c)).toBe(true)
  })

  it('verifyCodeChallenge rejects wrong verifier', () => {
    const c = generateCodeChallenge('correct-verifier')
    expect(verifyCodeChallenge('wrong-verifier', c)).toBe(false)
  })

  it('generateCodeVerifier produces unique values', () => {
    const a = generateCodeVerifier()
    const b = generateCodeVerifier()
    expect(a).not.toBe(b)
  })
})
