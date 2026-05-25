# @jetdevs/connect SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@jetdevs/connect` — the RP client SDK for Yobo Connect OAuth 2.0/OIDC, enabling yobo-merchant, crm, slides, and cadra to integrate "Sign in with Yobo" with minimal boilerplate.

**Architecture:** A lean TypeScript package in `core-sdk/connect/` (parallel to `core`, `framework`, `cloud`, `messaging`). Exports four submodules: `types` (shared TS types), `server` (PKCE flow, token exchange, JWKS verification), `next-auth` (drop-in NextAuth v4 provider), and `browser` (BFF-safe client-side helpers). jose is bundled as a direct dep. No raw token storage in browser.

**Tech Stack:** TypeScript 5, tsup (ESM), vitest, jose ^6, next-auth ^4 (peer), Node.js built-in `crypto` for PKCE.

---

## File Map

```
core-sdk/connect/
├── package.json                        ← NEW — package manifest
├── tsconfig.json                       ← NEW — TypeScript config
├── tsup.config.ts                      ← NEW — build config
├── src/
│   ├── index.ts                        ← NEW — re-exports from types/ (root entry)
│   ├── types/
│   │   └── index.ts                    ← NEW — ConnectConfig, TokenSet, ConnectUserinfo, OidcDiscovery, etc.
│   ├── server/
│   │   ├── index.ts                    ← NEW — YoboConnect class (main RP client)
│   │   ├── pkce.ts                     ← NEW — generateCodeVerifier, generateCodeChallenge, verifyCodeChallenge
│   │   ├── discovery.ts                ← NEW — DiscoveryCache, fetchDiscovery
│   │   └── jwks.ts                     ← NEW — verifyIdToken via jose createRemoteJWKSet
│   ├── next-auth/
│   │   └── index.ts                    ← NEW — YoboConnectProvider() NextAuth v4 OAuthConfig
│   └── browser/
│       └── index.ts                    ← NEW — initiateSignIn, initiateSignOut (no token storage)
└── src/__tests__/
    ├── pkce.test.ts                    ← NEW — PKCE round-trip + S256 compliance
    ├── server.test.ts                  ← NEW — YoboConnect methods with mocked fetch
    └── next-auth.test.ts               ← NEW — provider shape + profile mapping
```

**Also modified:**
- `core-sdk/pnpm-workspace.yaml` — add `'connect'` to packages list
- `core-sdk/package.json` — add `build:connect` + `publish:connect` scripts

---

## Task 1: Workspace registration

**Files:**
- Modify: `core-sdk/pnpm-workspace.yaml`
- Modify: `core-sdk/package.json`

- [ ] **Step 1: Add `connect` to pnpm workspace packages**

Edit `core-sdk/pnpm-workspace.yaml`:
```yaml
packages:
  - 'core'
  - 'framework'
  - 'cloud'
  - 'messaging'
  - 'connect'
```

- [ ] **Step 2: Add build/publish scripts to workspace root**

In `core-sdk/package.json`, add to `scripts`:
```json
"build:connect": "pnpm --filter @jetdevs/connect build",
"publish:connect": "pnpm --filter @jetdevs/connect publish --access public --no-git-checks"
```

- [ ] **Step 3: Verify workspace picks up the new package**

Run from `core-sdk/`:
```bash
pnpm list --filter @jetdevs/connect
```
Expected: prints `@jetdevs/connect` (even before package.json exists — pnpm resolves by directory).

---

## Task 2: Package scaffold (package.json, tsconfig.json, tsup.config.ts)

**Files:**
- Create: `core-sdk/connect/package.json`
- Create: `core-sdk/connect/tsconfig.json`
- Create: `core-sdk/connect/tsup.config.ts`

- [ ] **Step 1: Create `package.json`**

`core-sdk/connect/package.json`:
```json
{
  "name": "@jetdevs/connect",
  "version": "0.1.0-dev",
  "description": "RP client SDK for Yobo Connect OAuth 2.0 / OIDC integration",
  "type": "module",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./types": {
      "types": "./dist/types/index.d.ts",
      "import": "./dist/types/index.js"
    },
    "./server": {
      "types": "./dist/server/index.d.ts",
      "import": "./dist/server/index.js"
    },
    "./next-auth": {
      "types": "./dist/next-auth/index.d.ts",
      "import": "./dist/next-auth/index.js"
    },
    "./browser": {
      "types": "./dist/browser/index.d.ts",
      "import": "./dist/browser/index.js"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "jose": "^6.0.0"
  },
  "peerDependencies": {
    "next-auth": "^4.24.0"
  },
  "peerDependenciesMeta": {
    "next-auth": {
      "optional": true
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "devDependencies": {
    "@types/node": "^20.0.0",
    "next-auth": "^4.24.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

`core-sdk/connect/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": false,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `tsup.config.ts`**

`core-sdk/connect/tsup.config.ts`:
```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'types/index': 'src/types/index.ts',
    'server/index': 'src/server/index.ts',
    'next-auth/index': 'src/next-auth/index.ts',
    'browser/index': 'src/browser/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  external: [
    'next-auth',
    'next',
    'react',
  ],
})
```

Note: `jose` is NOT external — it's bundled (direct dep, not a peer, not shared across packages).

- [ ] **Step 4: Install deps**

```bash
cd core-sdk/connect && pnpm install
```
Expected: `node_modules/` created with `jose`, `tsup`, `vitest`, `next-auth`, `@types/node`.

---

## Task 3: Types module

**Files:**
- Create: `core-sdk/connect/src/types/index.ts`
- Create: `core-sdk/connect/src/index.ts`

- [ ] **Step 1: Write the types**

`core-sdk/connect/src/types/index.ts`:
```ts
/** Base configuration for a relying-party client. */
export interface ConnectConfig {
  /** Base URL of Yobo Connect, e.g. https://connect.yobolabs.ai */
  baseUrl: string
  /** OAuth client ID registered with Yobo Connect. */
  clientId: string
  /** OAuth client secret. Required for confidential clients. */
  clientSecret?: string
  /** Default redirect URI for authorization callbacks. */
  redirectUri: string
  /** Scopes to request by default. Defaults to ['openid', 'profile', 'email']. */
  defaultScopes?: string[]
  /** TTL for caching the discovery document in ms. Defaults to 3_600_000 (1h). */
  discoveryTtlMs?: number
}

/** Token set returned from /token endpoint. */
export interface TokenSet {
  accessToken: string
  refreshToken?: string
  idToken?: string
  tokenType: string
  expiresIn?: number
  scope?: string
  /** Absolute expiry timestamp (ms since epoch), if expiresIn was provided. */
  expiresAt?: number
}

/** Claims returned from /userinfo. */
export interface ConnectUserinfo {
  sub: string
  email?: string
  emailVerified?: boolean
  name?: string
  picture?: string
  /** Yobo org ID — the org the user selected at consent. */
  orgId?: number
  /** Yobo Connect membership role at the org level. NOT product RBAC. */
  orgRole?: 'owner' | 'admin' | 'member'
}

/** Verified claims from a Yobo Connect ID token (RS256 JWT). */
export interface ConnectIdTokenClaims {
  iss: string
  sub: string
  aud: string | string[]
  exp: number
  iat: number
  auth_time?: number
  nonce?: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
  org_id?: number
  org_role?: string
  /** Session ID for back-channel logout targeting. */
  sid?: string
}

/** OIDC discovery document shape (subset used by this SDK). */
export interface OidcDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  jwks_uri: string
  revocation_endpoint?: string
  introspection_endpoint?: string
  end_session_endpoint?: string
  scopes_supported?: string[]
  response_types_supported: string[]
  grant_types_supported: string[]
  code_challenge_methods_supported?: string[]
  backchannel_logout_supported?: boolean
}

/** Parameters for building an authorization URL. */
export interface AuthorizationParams {
  /** Scopes to request. Falls back to ConnectConfig.defaultScopes. */
  scopes?: string[]
  /** CSRF state. Auto-generated if omitted. */
  state?: string
  /** Nonce for ID token replay protection. Auto-generated if omitted. */
  nonce?: string
  /** RFC 8707 resource indicator (audience for the access token). */
  resource?: string
  prompt?: 'none' | 'login' | 'consent' | 'select_account'
}

/** Result of buildAuthorizationUrl — save codeVerifier + state + nonce server-side. */
export interface AuthorizationResult {
  url: string
  codeVerifier: string
  state: string
  nonce: string
}

/** Response from POST /introspect (RFC 7662). */
export interface IntrospectionResponse {
  active: boolean
  scope?: string
  client_id?: string
  username?: string
  token_type?: string
  exp?: number
  iat?: number
  sub?: string
  aud?: string | string[]
  iss?: string
  org_id?: number
}
```

- [ ] **Step 2: Write root index (re-exports types)**

`core-sdk/connect/src/index.ts`:
```ts
export type {
  ConnectConfig,
  TokenSet,
  ConnectUserinfo,
  ConnectIdTokenClaims,
  OidcDiscovery,
  AuthorizationParams,
  AuthorizationResult,
  IntrospectionResponse,
} from './types/index.js'
```

- [ ] **Step 3: Typecheck**

```bash
cd core-sdk/connect && pnpm typecheck
```
Expected: 0 errors.

---

## Task 4: PKCE module

**Files:**
- Create: `core-sdk/connect/src/server/pkce.ts`
- Create: `core-sdk/connect/src/__tests__/pkce.test.ts`

- [ ] **Step 1: Write the failing test**

`core-sdk/connect/src/__tests__/pkce.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd core-sdk/connect && pnpm test
```
Expected: FAIL — `Cannot find module '../server/pkce.js'`

- [ ] **Step 3: Implement PKCE**

`core-sdk/connect/src/server/pkce.ts`:
```ts
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd core-sdk/connect && pnpm test
```
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
cd core-sdk/connect && git add -A && git commit -m "feat(@jetdevs/connect): scaffold package + PKCE module"
```

---

## Task 5: Discovery + JWKS modules

**Files:**
- Create: `core-sdk/connect/src/server/discovery.ts`
- Create: `core-sdk/connect/src/server/jwks.ts`

- [ ] **Step 1: Write discovery cache + fetch**

`core-sdk/connect/src/server/discovery.ts`:
```ts
import type { OidcDiscovery } from '../types/index.js'

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class DiscoveryCache {
  private readonly store = new Map<string, CacheEntry<unknown>>()

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry || Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  clear(): void {
    this.store.clear()
  }
}

export async function fetchDiscovery(
  baseUrl: string,
  cache: DiscoveryCache,
  ttlMs: number,
): Promise<OidcDiscovery> {
  const key = `discovery:${baseUrl}`
  const cached = cache.get<OidcDiscovery>(key)
  if (cached) return cached

  const res = await fetch(`${baseUrl}/.well-known/openid-configuration`)
  if (!res.ok) {
    throw new Error(`OIDC discovery fetch failed: HTTP ${res.status} from ${baseUrl}`)
  }
  const doc = (await res.json()) as OidcDiscovery
  cache.set(key, doc, ttlMs)
  return doc
}
```

- [ ] **Step 2: Write JWKS / ID token verifier**

`core-sdk/connect/src/server/jwks.ts`:
```ts
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

/**
 * Verify a Yobo Connect ID token (RS256 JWT).
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
    throw new Error(`ID token nonce mismatch: expected ${nonce}, got ${claims.nonce ?? 'undefined'}`)
  }

  return claims
}
```

- [ ] **Step 3: Typecheck**

```bash
cd core-sdk/connect && pnpm typecheck
```
Expected: 0 errors.

---

## Task 6: YoboConnect server class

**Files:**
- Create: `core-sdk/connect/src/server/index.ts`
- Create: `core-sdk/connect/src/__tests__/server.test.ts`

- [ ] **Step 1: Write the failing tests**

`core-sdk/connect/src/__tests__/server.test.ts`:
```ts
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
      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }),
      )
      // First call: discovery; second: revoke
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
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd core-sdk/connect && pnpm test
```
Expected: FAIL — `Cannot find module '../server/index.js'`

- [ ] **Step 3: Implement YoboConnect class**

`core-sdk/connect/src/server/index.ts`:
```ts
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
    return this._postToken(discovery.token_endpoint, body)
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
    return this._postToken(discovery.token_endpoint, body)
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
      const text = await res.text().catch(() => '')
      throw new Error(`Revoke failed ${res.status}: ${text}`)
    }
  }

  async getUserinfo(accessToken: string): Promise<ConnectUserinfo> {
    const discovery = await this.getDiscovery()
    const res = await fetch(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Userinfo request failed: HTTP ${res.status}`)
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

  private async _postToken(endpoint: string, body: URLSearchParams): Promise<TokenSet> {
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
```

- [ ] **Step 4: Run tests**

```bash
cd core-sdk/connect && pnpm test
```
Expected: All server tests pass (plus PKCE tests still passing).

- [ ] **Step 5: Commit**

```bash
cd core-sdk/connect && git add -A && git commit -m "feat(@jetdevs/connect): discovery cache + JWKS verifier + YoboConnect class"
```

---

## Task 7: NextAuth v4 provider

**Files:**
- Create: `core-sdk/connect/src/next-auth/index.ts`
- Create: `core-sdk/connect/src/__tests__/next-auth.test.ts`

- [ ] **Step 1: Write the failing tests**

`core-sdk/connect/src/__tests__/next-auth.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd core-sdk/connect && pnpm test
```
Expected: FAIL — `Cannot find module '../next-auth/index.js'`

- [ ] **Step 3: Implement the provider**

`core-sdk/connect/src/next-auth/index.ts`:
```ts
import type { OAuthConfig } from 'next-auth/providers'
import type { ConnectUserinfo } from '../types/index.js'

/** Profile returned from Yobo Connect's /userinfo endpoint. */
export type YoboConnectProfile = ConnectUserinfo

export interface YoboConnectProviderConfig {
  /** Base URL of Yobo Connect, e.g. https://connect.yobolabs.ai */
  baseUrl: string
  /** OAuth client ID registered with Yobo Connect. */
  clientId: string
  /** OAuth client secret. */
  clientSecret: string
  /**
   * Scopes to request. Defaults to ['openid', 'profile', 'email', 'offline_access'].
   * Include 'offline_access' to receive refresh tokens.
   */
  defaultScopes?: string[]
}

/**
 * Drop-in NextAuth v4 provider for Yobo Connect.
 *
 * Usage in [...nextauth].ts:
 * ```ts
 * import { YoboConnectProvider } from '@jetdevs/connect/next-auth'
 *
 * export default NextAuth({
 *   providers: [
 *     YoboConnectProvider({
 *       baseUrl: process.env.YOBO_CONNECT_URL!,
 *       clientId: process.env.YOBO_CONNECT_CLIENT_ID!,
 *       clientSecret: process.env.YOBO_CONNECT_CLIENT_SECRET!,
 *     }),
 *   ],
 * })
 * ```
 */
export function YoboConnectProvider(
  config: YoboConnectProviderConfig,
): OAuthConfig<YoboConnectProfile> {
  const scopes = config.defaultScopes ?? ['openid', 'profile', 'email', 'offline_access']

  return {
    id: 'yobo-connect',
    name: 'Yobo Connect',
    type: 'oauth',
    wellKnown: `${config.baseUrl}/.well-known/openid-configuration`,
    authorization: {
      params: {
        scope: scopes.join(' '),
      },
    },
    checks: ['pkce', 'state', 'nonce'],
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    profile(profile: YoboConnectProfile) {
      return {
        id: profile.sub,
        name: profile.name ?? profile.email ?? profile.sub,
        email: profile.email,
        image: profile.picture,
      }
    },
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
cd core-sdk/connect && pnpm test
```
Expected: All tests pass (PKCE + server + next-auth).

- [ ] **Step 5: Commit**

```bash
cd core-sdk/connect && git add -A && git commit -m "feat(@jetdevs/connect): NextAuth v4 provider preset"
```

---

## Task 8: Browser helpers

**Files:**
- Create: `core-sdk/connect/src/browser/index.ts`

No tests for browser — the functions call `window.location.assign` which can't be unit-tested meaningfully in vitest's Node environment.

- [ ] **Step 1: Write browser module**

`core-sdk/connect/src/browser/index.ts`:
```ts
"use client"
/**
 * @jetdevs/connect/browser
 *
 * Client-side helpers for Yobo Connect in BFF / server-side OIDC flows.
 *
 * SECURITY: The browser NEVER holds raw access or refresh tokens.
 * Tokens live in server-side session storage; the browser holds only
 * the RP's httpOnly session cookie. These helpers redirect the browser
 * to the RP's own server-side auth routes — they never contact Yobo
 * Connect directly.
 */

export interface SignInOptions {
  /** URL to redirect to after successful sign-in (relative to RP origin). */
  returnTo?: string
  /** Force re-authentication ('login') or re-consent ('consent'). */
  prompt?: 'login' | 'consent'
}

export interface SignOutOptions {
  /** URL to redirect to after sign-out (relative to RP origin). */
  returnTo?: string
}

/**
 * Redirect the browser to the RP's sign-in route.
 * With NextAuth, this calls `/api/auth/signin/yobo-connect`.
 * The RP server handles the OIDC redirect to Yobo Connect.
 */
export function initiateSignIn(options: SignInOptions = {}): void {
  const url = new URL('/api/auth/signin/yobo-connect', window.location.origin)
  if (options.returnTo) url.searchParams.set('callbackUrl', options.returnTo)
  if (options.prompt) url.searchParams.set('prompt', options.prompt)
  window.location.assign(url.toString())
}

/**
 * Redirect the browser to the RP's sign-out route.
 * With NextAuth, this calls `/api/auth/signout`.
 * The RP server clears the session and optionally calls Yobo Connect's end_session_endpoint.
 */
export function initiateSignOut(options: SignOutOptions = {}): void {
  const url = new URL('/api/auth/signout', window.location.origin)
  if (options.returnTo) url.searchParams.set('callbackUrl', options.returnTo)
  window.location.assign(url.toString())
}
```

---

## Task 9: Build verification

**Files:** None new — verifying the build pipeline end-to-end.

- [ ] **Step 1: Run full test suite**

```bash
cd core-sdk/connect && pnpm test
```
Expected: All tests pass.

- [ ] **Step 2: Typecheck**

```bash
cd core-sdk/connect && pnpm typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Build the package**

```bash
cd core-sdk/connect && pnpm build
```
Expected: `dist/` created with:
- `dist/index.js` + `dist/index.d.ts`
- `dist/types/index.js` + `dist/types/index.d.ts`
- `dist/server/index.js` + `dist/server/index.d.ts`
- `dist/next-auth/index.js` + `dist/next-auth/index.d.ts`
- `dist/browser/index.js` + `dist/browser/index.d.ts`

- [ ] **Step 4: Verify exports are importable**

```bash
node --input-type=module <<'EOF'
import { YoboConnect } from './core-sdk/connect/dist/server/index.js'
console.log(typeof YoboConnect)
EOF
```
Expected: `function`

- [ ] **Step 5: Add to workspace root scripts and verify pnpm build:connect works**

```bash
cd core-sdk && pnpm build:connect
```
Expected: Clean build with no errors.

- [ ] **Step 6: Final commit**

```bash
cd core-sdk/connect && git add -A && git commit -m "feat(@jetdevs/connect): browser helpers + build verified"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `@jetdevs/connect/types` — shared TypeScript types | Task 3 |
| `@jetdevs/connect/server` — PKCE, discovery, token exchange, JWKS | Tasks 4, 5, 6 |
| `@jetdevs/connect/next-auth` — drop-in NextAuth v4 provider | Task 7 |
| `@jetdevs/connect/browser` — BFF-safe, no raw token storage | Task 8 |
| Workspace registration in core-sdk | Task 1 |
| Build pipeline (tsup, dts, ESM) | Task 2, 9 |
| PKCE S256-only enforcement | Task 4 (verifyCodeChallenge), Task 6 (S256 in buildAuthorizationUrl) |
| Refresh token rotation (scope narrowing) | Task 6 (refreshTokens scopeSubset param) |
| Revocation with token_type_hint | Task 6 |
| Introspection (fallback) | Task 6 |
| Discovery document caching | Tasks 5 + 6 (cache hit test) |
| ID token verification (RS256, issuer, audience, nonce) | Task 5 (jwks.ts) |

**Design gap noted:** `@jetdevs/connect/middleware` (Next.js middleware helpers for token validation) was listed in the design but is out of scope for v1 — yobo-merchant validates tokens via `v_token_validation` DB view, not SDK middleware. Skip until needed.

### Placeholder scan
None found — all code blocks are complete and runnable.

### Type consistency check
- `ConnectConfig` defined in Task 3, used in Task 6 (`YoboConnect` constructor) ✓
- `TokenSet` defined in Task 3, returned by `_postToken`, `exchangeCode`, `refreshTokens` ✓
- `ConnectUserinfo` defined in Task 3, used as return type of `getUserinfo` and as `YoboConnectProfile` in Task 7 ✓
- `OidcDiscovery` defined in Task 3, used in `discovery.ts` return type and `jwks.ts` param ✓
- `AuthorizationResult` defined in Task 3, returned by `buildAuthorizationUrl` ✓
