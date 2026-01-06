import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'db/index': 'src/db/index.ts',
    'permissions/index': 'src/permissions/index.ts',
    'auth/index': 'src/auth/index.ts',
    'router/index': 'src/router/index.ts',
    'trpc/index': 'src/trpc/index.ts',
    // Tenant module for custom domain support (server-safe)
    'tenant/index': 'src/tenant/index.ts',
    // Tenant client module for React hooks (client-only)
    'tenant/client': 'src/tenant/client.ts',
  },
  format: ['cjs', 'esm'],
  dts: {
    resolve: true,
    // Skip modules that have Next.js dependencies (Phase 2 - not production yet)
    entry: {
      index: 'src/index.ts',
      'db/index': 'src/db/index.ts',
      'permissions/index': 'src/permissions/index.ts',
      'auth/index': 'src/auth/index.ts',
      'router/index': 'src/router/index.ts',
      'trpc/index': 'src/trpc/index.ts',
      // Tenant module for custom domain support (server-safe)
      'tenant/index': 'src/tenant/index.ts',
      // Tenant client module for React hooks (client-only)
      'tenant/client': 'src/tenant/client.ts',
    },
  },
  sourcemap: true,
  clean: true,
  minify: false, // Disable minification to debug exports
  splitting: false,
  treeshake: false, // Disable tree-shaking to ensure all exports are included
  external: [
    'drizzle-orm',
    '@trpc/server',
    '@trpc/server/observable',
    '@trpc/client',
    '@tanstack/react-query',
    'next-auth',
    'zod',
    'next/cache',
    'next/headers',
    'next/navigation',
    // React - keep external as peer dependency
    'react',
    // Node.js built-in modules - keep external to avoid bundling issues
    'async_hooks',
  ],
});
