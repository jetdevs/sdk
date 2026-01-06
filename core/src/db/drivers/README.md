# Database Driver Abstraction Layer

A flexible, driver-agnostic database abstraction for `@jetdevs/core` that allows easy switching between different cloud providers and database systems.

## Overview

This abstraction layer provides:

- **Multiple Driver Support**: postgres.js, Neon serverless, node-postgres, PlanetScale, and more
- **Runtime Driver Selection**: Configure via environment variables or code
- **Environment Auto-Detection**: Automatically selects the best driver for Vercel, AWS Lambda, edge runtimes, etc.
- **Full Drizzle ORM Integration**: Type-safe database access across all drivers
- **Transaction Support**: Unified transaction API with savepoints
- **Connection Pooling**: Proper pool management for each driver type

## Installation

The core package includes the postgres.js driver by default. For other drivers, install them as needed:

```bash
# Neon serverless (recommended for Vercel + Neon)
npm install @neondatabase/serverless

# node-postgres (for AWS RDS, traditional PostgreSQL)
npm install pg

# PlanetScale (for MySQL serverless)
npm install @planetscale/database
```

## Quick Start

### Basic Usage

```typescript
import { createDatabase } from '@jetdevs/core/db/drivers';
import * as schema from './schema';

// Auto-detect driver based on environment and URL
const db = await createDatabase({
  schema,
  url: process.env.DATABASE_URL,
});

// Use Drizzle ORM as usual
const users = await db.drizzle.query.users.findMany();

// Raw SQL queries
const result = await db.execute('SELECT * FROM users WHERE id = $1', [1]);

// Transactions
await db.transaction(async (tx) => {
  await tx.execute('INSERT INTO users (name) VALUES ($1)', ['John']);
  await tx.execute('INSERT INTO profiles (user_id) VALUES (currval($1))', ['users_id_seq']);
});

// Clean up
await db.close();
```

### Explicit Driver Selection

```typescript
// Force a specific driver
const db = await createDatabase({
  driver: 'neon-http',  // 'postgres' | 'neon-http' | 'neon-ws' | 'pg-pool' | 'planetscale'
  schema,
  url: process.env.DATABASE_URL,
});
```

### Environment Variable Configuration

```bash
# Connection URL (required)
DATABASE_URL=postgresql://user:pass@host/db

# Explicit driver selection (optional - auto-detected if not set)
DATABASE_DRIVER=neon-http

# Pool size (optional)
DATABASE_POOL_MAX=20

# Debug logging (optional)
DATABASE_DEBUG=true
```

## Driver Selection Guide

### When to Use Each Driver

| Driver | Best For | Transactions | Serverless |
|--------|----------|--------------|------------|
| `postgres` | Traditional servers, local dev | Yes | No |
| `neon-http` | Vercel + Neon (simple queries) | No | Yes |
| `neon-ws` | Vercel + Neon (with transactions) | Yes | Yes |
| `pg-pool` | AWS RDS, enterprise PostgreSQL | Yes | No |
| `planetscale` | PlanetScale MySQL | No | Yes |

### Auto-Detection Rules

The abstraction automatically selects the best driver based on:

1. **Explicit Configuration**: `DATABASE_DRIVER` env var or `driver` option
2. **URL Analysis**: Detects Neon, PlanetScale, AWS RDS from connection URL
3. **Runtime Environment**: Detects Vercel, AWS Lambda, edge runtimes
4. **Fallback**: Uses `postgres` driver as default

### Vercel + Neon Deployment

For Vercel deployments with Neon:

```typescript
// In serverless functions - HTTP mode (no transactions)
const db = await createDatabase({
  driver: 'neon-http',
  schema,
  url: process.env.DATABASE_URL,
});

// If you need transactions - WebSocket mode
const db = await createDatabase({
  driver: 'neon-ws',
  schema,
  url: process.env.DATABASE_URL,
});
```

### AWS RDS Deployment

For AWS RDS with connection pooling:

```typescript
const db = await createDatabase({
  driver: 'pg-pool',
  schema,
  url: process.env.DATABASE_URL,
  pool: {
    max: 20,
    idleTimeout: 30,
  },
  ssl: 'require',
});
```

## Multi-Client Setup (RLS)

For applications with Row-Level Security requiring multiple access levels:

```typescript
import { createDbClients } from '@jetdevs/core/db/drivers';
import * as schema from './schema';

const clients = await createDbClients({
  schema,
  url: process.env.DATABASE_URL,                    // Standard (RLS enforced)
  privilegedUrl: process.env.INTERNAL_API_DATABASE_URL,  // Bypasses RLS
  adminUrl: process.env.ADMIN_DATABASE_URL,         // Full privileges
});

// Standard operations (RLS enforced)
const users = await clients.db.drizzle.query.users.findMany();

// Privileged operations (cross-org access)
await clients.withPrivilegedDb(async (db) => {
  return db.drizzle.query.users.findMany();
});

// Admin operations
await clients.withAdminDb(async (db) => {
  // Schema changes, RLS policy updates, etc.
});

// Clean up all connections
await clients.closeAll();
```

## Migration from Current Implementation

### Before (Direct postgres.js usage)

```typescript
// Old: ai-saas-v2/src/db/clients.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
});

export const db = drizzle(client, { schema });
```

### After (Using Driver Abstraction)

```typescript
// New: ai-saas-v2/src/db/clients.ts
import { createDatabase } from '@jetdevs/core/db/drivers';
import * as schema from './schema';

// Simple - auto-detects driver
export const db = await createDatabase({
  schema,
  pool: { max: 10, idleTimeout: 20 },
});

// Or with explicit driver for clarity
export const db = await createDatabase({
  driver: 'postgres',
  schema,
  pool: { max: 10, idleTimeout: 20 },
});
```

### Using the Drizzle Instance

The `db.drizzle` property gives you the standard Drizzle instance:

```typescript
// Before
const users = await db.query.users.findMany();

// After - access via drizzle property
const users = await db.drizzle.query.users.findMany();

// Or destructure for familiar usage
const { drizzle } = await createDatabase({ schema });
const users = await drizzle.query.users.findMany();
```

## Advanced Configuration

### Connection Pool Options

```typescript
const db = await createDatabase({
  schema,
  pool: {
    max: 20,           // Maximum connections
    min: 5,            // Minimum connections
    idleTimeout: 30,   // Close idle connections after 30s
    maxLifetime: 1800, // Maximum connection lifetime (30 min)
    connectTimeout: 10, // Connection timeout
  },
});
```

### SSL Configuration

```typescript
// Simple modes
const db = await createDatabase({
  schema,
  ssl: 'require',  // or 'prefer' or true/false
});

// Custom SSL configuration
const db = await createDatabase({
  schema,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('./ca-cert.pem'),
    cert: fs.readFileSync('./client-cert.pem'),
    key: fs.readFileSync('./client-key.pem'),
  },
});
```

### Debug Logging

```typescript
const db = await createDatabase({
  schema,
  debug: true,
  logger: (message, context) => {
    console.log(`[DB] ${message}`, context);
  },
});
```

## Transaction Handling

### Basic Transactions

```typescript
await db.transaction(async (tx) => {
  const user = await tx.execute(
    'INSERT INTO users (name) VALUES ($1) RETURNING *',
    ['John']
  );

  await tx.execute(
    'INSERT INTO profiles (user_id, bio) VALUES ($1, $2)',
    [user[0].id, 'Hello world']
  );
});
```

### Transaction Options

```typescript
await db.transaction(async (tx) => {
  // ... operations
}, {
  isolationLevel: 'serializable',
  accessMode: 'read write',
});
```

### Savepoints (Nested Transactions)

```typescript
await db.transaction(async (tx) => {
  await tx.execute('INSERT INTO users ...');

  // Create a savepoint
  await tx.savepoint(async (sp) => {
    await sp.execute('INSERT INTO profiles ...');

    // This can be rolled back without affecting the outer transaction
    throw new Error('Rollback to savepoint');
  });

  // Continues here if savepoint rolled back
});
```

## Type Safety

The abstraction maintains full type safety with Drizzle ORM:

```typescript
import { createDatabase, type Database } from '@jetdevs/core/db/drivers';
import * as schema from './schema';

// Full type inference
const db: Database<typeof schema> = await createDatabase({ schema });

// Drizzle queries are fully typed
const users = await db.drizzle.query.users.findMany({
  where: (users, { eq }) => eq(users.isActive, true),
  with: {
    profile: true,
  },
});
// users is fully typed based on schema
```

## Error Handling

```typescript
try {
  await db.transaction(async (tx) => {
    await tx.execute('INSERT INTO users ...');
  });
} catch (error) {
  if (error.code === '23505') {
    // Unique constraint violation
  } else if (error.code === 'ECONNREFUSED') {
    // Connection error
  }
  throw error;
}
```

## Health Checks

```typescript
// Test database connectivity
const isHealthy = await db.ping();

if (!isHealthy) {
  console.error('Database connection failed');
}
```

## Best Practices

1. **Use Environment Variables**: Keep database URLs and driver selection in environment variables
2. **Pool Sizing**: Start with `max: 10` and adjust based on your workload
3. **Connection Management**: Always call `db.close()` in cleanup hooks
4. **Transaction Scope**: Keep transactions short to avoid lock contention
5. **Serverless Considerations**: Use HTTP-based drivers (neon-http, planetscale) for serverless
6. **SSL in Production**: Always enable SSL in production environments

## Troubleshooting

### "Transaction not supported"

If you see this error with `neon-http` or `planetscale` drivers, these don't support transactions. Either:
- Restructure your code to avoid transactions
- Use `neon-ws` driver for Neon
- Use a connection pooler with transaction support

### "Too many connections"

Reduce your pool size or use a connection pooler:

```typescript
const db = await createDatabase({
  schema,
  pool: { max: 5 },  // Reduce from default 10
});
```

### "SSL required"

Most cloud providers require SSL. Enable it:

```typescript
const db = await createDatabase({
  schema,
  ssl: 'require',
});
```

## API Reference

See the TypeScript definitions in `./types.ts` for complete API documentation.
