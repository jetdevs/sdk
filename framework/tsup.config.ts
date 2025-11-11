import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'db/index': 'src/db/index.ts',
    'permissions/index': 'src/permissions/index.ts',
    'auth/index': 'src/auth/index.ts',
    'router/index': 'src/router/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: false, // Skip DTS generation for now due to type issues
  sourcemap: true,
  clean: true,
  minify: true,
  splitting: false,
  treeshake: true,
  external: [
    'drizzle-orm',
    '@trpc/server',
    'next-auth',
    'zod',
    'next/cache',
    'next/headers',
    'next/navigation',
  ],
});
