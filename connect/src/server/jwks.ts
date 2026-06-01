import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { ConnectIdTokenClaims, OidcDiscovery } from '../types/index.js'

// Module-level cache: one RemoteJWKSet per jwks_uri (reuses the jose internal key cache)
const jwksSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwksSet(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksSets.has(jwksUri)) {
    jwksSets.set(jwksUri, createRemoteJWKSet(new URL(jwksUri)))
  }
  return jwksSets.get(jwksUri)!
}

/** Clear the cached RemoteJWKSet instances (e.g. after a provider key migration). */
export function clearJwksCache(): void {
  jwksSets.clear()
}

/**
 * Verify a Connect ID token (RS256 JWT).
 * Fetches JWKS from the discovery document's jwks_uri; jose caches keys internally.
 *
 * @throws if signature invalid, issuer/audience mismatch, expired, or nonce mismatch
 */
export async function verifyIdToken(
  idToken: string,
  discovery: OidcDiscovery,
  clientId: string,
  nonce?: string,
): Promise<ConnectIdTokenClaims> {
  const jwks = getJwksSet(discovery.jwks_uri)

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: discovery.issuer,
    audience: clientId,
    algorithms: ['RS256'],
  })

  const claims = payload as unknown as ConnectIdTokenClaims

  if (nonce !== undefined && claims.nonce !== nonce) {
    // Generic message — do not leak the expected/received nonce values into logs.
    throw new Error('ID token nonce mismatch')
  }

  return claims
}
