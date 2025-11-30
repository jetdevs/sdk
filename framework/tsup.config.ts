import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'db/index': 'src/db/index.ts',
    'permissions/index': 'src/permissions/index.ts',
    'auth/index': 'src/auth/index.ts',
    'router/index': 'src/router/index.ts',
    'trpc/index': 'src/trpc/index.ts',
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
    'next-auth',
    'zod',
    'next/cache',
    'next/headers',
    'next/navigation',
    // Node.js built-in modules - keep external to avoid bundling issues
    'async_hooks',
  ],
});
