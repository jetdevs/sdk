# Vercel Deployment Guide

This guide covers deploying the core/extension architecture to Vercel, including monorepo configuration, build settings, and production optimizations.

## Monorepo Structure for Vercel

Vercel natively supports monorepos with Turborepo. The architecture is designed to work seamlessly:

```
monorepo/
├── packages/
│   └── saas-core/           # Internal package (not deployed)
├── apps/
│   └── my-saas/             # Deployed to Vercel
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## Configuration Files

### Root `package.json`

```json
{
  "name": "yobo-monorepo",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

## App Configuration

### `apps/my-saas/package.json`

```json
{
  "name": "@yobo/my-saas",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "postinstall": "prisma generate || true"
  },
  "dependencies": {
    "@yobo/saas-core": "workspace:*",
    "next": "^15.1.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@trpc/server": "^11.0.0",
    "@trpc/client": "^11.0.0",
    "drizzle-orm": "^0.30.0",
    "postgres": "^3.4.0",
    "@auth/core": "^0.34.0",
    "next-auth": "^5.0.0-beta"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "typescript": "^5.4.0",
    "drizzle-kit": "^0.21.0"
  }
}
```

### `apps/my-saas/next.config.mjs`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode
  reactStrictMode: true,

  // Transpile the workspace package
  transpilePackages: ['@yobo/saas-core'],

  // Image optimization domains
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },

  // Environment variables validation
  env: {
    // Expose non-sensitive vars to client
  },

  // Webpack configuration for workspace packages
  webpack: (config, { isServer }) => {
    // Handle workspace package resolution
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ]
  },

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
}

export default nextConfig
```

## Vercel Project Configuration

### `apps/my-saas/vercel.json`

```json
{
  "buildCommand": "cd ../.. && pnpm turbo build --filter=@yobo/my-saas",
  "installCommand": "cd ../.. && pnpm install",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

Alternatively, configure via Vercel Dashboard:

1. **Root Directory**: `apps/my-saas`
2. **Build Command**: `cd ../.. && pnpm turbo build --filter=@yobo/my-saas`
3. **Install Command**: `cd ../.. && pnpm install`
4. **Output Directory**: `.next`

### Alternative: Use `vercel.json` at Root

```json
{
  "buildCommand": "pnpm turbo build --filter=@yobo/my-saas",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "outputDirectory": "apps/my-saas/.next"
}
```

## Environment Variables

### Required Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

```bash
# Database (use connection pooling for serverless)
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require&pgbouncer=true"
DATABASE_URL_UNPOOLED="postgresql://user:pass@host:5432/db?sslmode=require"

# For migrations (direct connection, no pooler)
DATABASE_MIGRATE_URL="postgresql://user:pass@host:5432/db?sslmode=require"

# Authentication
NEXTAUTH_URL="https://your-domain.vercel.app"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# OAuth providers (optional)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."

# Application
NEXT_PUBLIC_APP_URL="https://your-domain.vercel.app"
```

### Environment-Specific Variables

Vercel allows different values per environment:

- **Production**: `your-domain.com`
- **Preview**: `*.vercel.app` (auto-generated)
- **Development**: `localhost:3000`

## Database Configuration for Serverless

### Connection Pooling

Serverless functions can exhaust database connections. Use a connection pooler:

**Option 1: Neon with Pooler (Recommended)**

```bash
# Pooled connection for queries
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/db?sslmode=require&pgbouncer=true"

# Direct connection for migrations
DATABASE_MIGRATE_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/db?sslmode=require"
```

**Option 2: Supabase with Supavisor**

```bash
DATABASE_URL="postgresql://postgres:pass@db.xxx.supabase.co:6543/postgres?pgbouncer=true"
DATABASE_MIGRATE_URL="postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres"
```

**Option 3: PgBouncer on your own server**

```bash
DATABASE_URL="postgresql://user:pass@pgbouncer.your-server.com:6432/db"
DATABASE_MIGRATE_URL="postgresql://user:pass@postgres.your-server.com:5432/db"
```

### Database Client Configuration

```typescript
// packages/saas-core/src/db/client.ts

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export function createDbClient(url: string) {
  // Serverless-optimized connection settings
  const client = postgres(url, {
    max: 1, // Single connection per serverless instance
    idle_timeout: 20, // Close idle connections quickly
    connect_timeout: 10, // Fail fast on connection issues
    ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
    prepare: false, // Disable prepared statements for pgbouncer compatibility
  })

  return drizzle(client, { schema })
}

// For migrations (needs direct connection)
export function createMigrationClient(url: string) {
  const client = postgres(url, {
    max: 1,
    ssl: 'require',
  })
  return drizzle(client, { schema })
}
```

### App Database Initialization

```typescript
// apps/my-saas/src/db/index.ts

import { createDbClient } from '@yobo/saas-core/db'

// Use connection string from environment
export const db = createDbClient(process.env.DATABASE_URL!)

// Export for use in tRPC context
export { db }
```

## RLS Context in Serverless

Setting PostgreSQL session variables works in serverless, but you need to ensure the context is set per-request:

```typescript
// packages/saas-core/src/rls/context.ts

import { sql } from 'drizzle-orm'
import type { DbClient } from '../db'

export async function setRlsContext(
  db: DbClient,
  orgId: string | null
) {
  if (!orgId) {
    // Clear context for system operations
    await db.execute(sql`SET LOCAL rls.current_org_id = ''`)
    return
  }

  // Set org context for this transaction/request
  await db.execute(sql`SET LOCAL rls.current_org_id = ${orgId}`)
}

// Wrapper for org-scoped database operations
export async function withOrgContext<T>(
  db: DbClient,
  orgId: string,
  operation: () => Promise<T>
): Promise<T> {
  await setRlsContext(db, orgId)
  return operation()
}
```

### tRPC Context with RLS

```typescript
// apps/my-saas/src/server/api/trpc.ts

import { initTRPC } from '@trpc/server'
import { db } from '@/db'
import { setRlsContext } from '@yobo/saas-core/rls'
import { getServerSession } from '@yobo/saas-core/auth'

export const createTRPCContext = async (opts: { req: Request }) => {
  const session = await getServerSession()

  // Set RLS context if user is logged in
  if (session?.user?.orgId) {
    await setRlsContext(db, session.user.orgId)
  }

  return {
    db,
    session,
    actor: session?.user
      ? {
          userId: session.user.id,
          orgId: session.user.orgId,
          permissions: session.user.permissions,
        }
      : null,
  }
}
```

## Build & Deploy

### Initial Setup

1. **Connect Repository to Vercel**
   ```bash
   # From monorepo root
   vercel link
   ```

2. **Configure Build Settings**
   - Root Directory: `apps/my-saas` (or leave empty if using root vercel.json)
   - Framework: Next.js
   - Build Command: `cd ../.. && pnpm turbo build --filter=@yobo/my-saas`

3. **Add Environment Variables**
   - Go to Vercel Dashboard → Project → Settings → Environment Variables
   - Add all required variables

4. **Deploy**
   ```bash
   vercel deploy --prod
   ```

### CI/CD with GitHub Actions

```yaml
# .github/workflows/deploy.yml

name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Run tests
        run: pnpm test

      - name: Install Vercel CLI
        run: pnpm add -g vercel@latest

      - name: Pull Vercel Environment
        run: vercel pull --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}

      - name: Build
        run: vercel build --token=${{ secrets.VERCEL_TOKEN }}

      - name: Deploy to Preview
        if: github.event_name == 'pull_request'
        run: vercel deploy --prebuilt --token=${{ secrets.VERCEL_TOKEN }}

      - name: Deploy to Production
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

## Database Migrations on Deploy

### Option 1: Manual Migrations

Run migrations before deploying:

```bash
# Set migration URL
export DATABASE_MIGRATE_URL="postgresql://..."

# Run migrations
cd apps/my-saas
pnpm db:migrate:run

# Then deploy
vercel deploy --prod
```

### Option 2: Vercel Build Hook

Create a build hook script:

```typescript
// apps/my-saas/scripts/prebuild.ts

import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

async function runMigrations() {
  if (!process.env.DATABASE_MIGRATE_URL) {
    console.log('Skipping migrations: DATABASE_MIGRATE_URL not set')
    return
  }

  console.log('Running database migrations...')

  const client = postgres(process.env.DATABASE_MIGRATE_URL, { max: 1 })
  const db = drizzle(client)

  await migrate(db, { migrationsFolder: './drizzle' })

  await client.end()
  console.log('Migrations complete!')
}

runMigrations().catch(console.error)
```

Add to build:

```json
{
  "scripts": {
    "build": "tsx scripts/prebuild.ts && next build"
  }
}
```

### Option 3: Neon Branching (Recommended for Preview)

Neon supports database branching for preview deployments:

```bash
# vercel.json
{
  "build": {
    "env": {
      "DATABASE_URL": "@database-url-preview"
    }
  }
}
```

Configure Neon to create a branch per PR.

## Edge Runtime Compatibility

If using Vercel Edge Functions, ensure your code is edge-compatible:

### Core Package Considerations

```typescript
// packages/saas-core/src/db/client.ts

// Use @vercel/postgres for edge runtime
import { sql } from '@vercel/postgres'

// OR use neon serverless driver
import { neon } from '@neondatabase/serverless'

export function createEdgeDbClient() {
  const sql = neon(process.env.DATABASE_URL!)
  return sql
}
```

### Mark Edge-Incompatible Routes

```typescript
// apps/my-saas/src/app/api/trpc/[trpc]/route.ts

// Force Node.js runtime for tRPC (uses postgres driver)
export const runtime = 'nodejs'

// If your route can run on edge:
// export const runtime = 'edge'
```

### Middleware Edge Compatibility

```typescript
// apps/my-saas/src/middleware.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}

export function middleware(request: NextRequest) {
  // Edge-compatible middleware logic
  // Don't use postgres or heavy node modules here

  const response = NextResponse.next()

  // Add security headers
  response.headers.set('X-Frame-Options', 'DENY')

  return response
}
```

## Caching Strategies

### ISR (Incremental Static Regeneration)

```typescript
// apps/my-saas/src/app/page.tsx

export const revalidate = 60 // Revalidate every 60 seconds

export default async function HomePage() {
  const data = await fetchData()
  return <div>{/* ... */}</div>
}
```

### tRPC Caching

```typescript
// Extension router with caching
export const projectsRouter = createRouterWithActor({
  list: {
    type: 'query',
    permission: 'project:read',
    cache: {
      ttl: 60, // Cache for 60 seconds
      tags: ['projects'],
    },
    handler: async ({ ctx }) => {
      // Cached response
    },
  },
})
```

### Vercel KV for Session Caching

```bash
# Install
pnpm add @vercel/kv
```

```typescript
// packages/saas-core/src/auth/session-cache.ts

import { kv } from '@vercel/kv'

export async function cacheSession(userId: string, session: Session) {
  await kv.set(`session:${userId}`, session, { ex: 3600 })
}

export async function getCachedSession(userId: string) {
  return kv.get<Session>(`session:${userId}`)
}
```

## Monitoring & Debugging

### Vercel Analytics

```typescript
// apps/my-saas/src/app/layout.tsx

import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### Speed Insights

```typescript
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
```

### Error Tracking

```typescript
// apps/my-saas/src/app/error.tsx

'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to your error tracking service
    console.error(error)
  }, [error])

  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
```

## Production Checklist

Before deploying to production:

- [ ] All environment variables set
- [ ] Database connection pooling configured
- [ ] Migrations applied
- [ ] RLS policies deployed
- [ ] Permissions synced
- [ ] NEXTAUTH_SECRET is secure (32+ bytes)
- [ ] NEXTAUTH_URL matches production domain
- [ ] OAuth redirect URLs configured in providers
- [ ] Error tracking configured
- [ ] Analytics enabled
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Rate limiting configured
- [ ] CSP headers set
- [ ] Database backups configured

## Troubleshooting

### Build Fails: "Module not found"

Ensure `transpilePackages` is set:

```javascript
// next.config.mjs
const nextConfig = {
  transpilePackages: ['@yobo/saas-core'],
}
```

### Database Connection Errors

1. Check connection string format
2. Ensure pooler is being used
3. Verify SSL is enabled
4. Check connection limits

### RLS Not Working

1. Ensure RLS context is set in tRPC context
2. Verify policies are deployed
3. Check org_id is in session

### Slow Cold Starts

1. Reduce bundle size
2. Use connection pooling
3. Consider edge functions for auth checks
4. Enable ISR for static content

### Preview Deployments Failing

1. Check preview environment variables
2. Ensure database is accessible from preview
3. Consider database branching for previews
