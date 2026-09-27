import { randomBytes, createHash } from 'crypto'

/**
 * Generate a random PKCE code verifier.
 * 32 bytes → 43 base64url characters (no padding). Meets RFC 7636 §4.1.
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Derive the S256 code challenge from a verifier.
 * S256: BASE64URL(SHA-256(ASCII(code_verifier)))
 */
export function generateCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'ascii').digest('base64url')
}

/**
 * Verify that a code verifier matches a stored S256 code challenge.
 * Use on the server when validating a /token request.
 */
export function verifyCodeChallenge(codeVerifier: string, codeChallenge: string): boolean {
  return generateCodeChallenge(codeVerifier) === codeChallenge
}
