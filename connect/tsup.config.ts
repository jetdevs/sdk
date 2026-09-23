import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'types/index': 'src/types/index.ts',
    'server/index': 'src/server/index.ts',
    'server/revocation/index': 'src/server/revocation/index.ts',
    'server/handoff/index': 'src/server/handoff/index.ts',
    'server/owner/index': 'src/server/owner/index.ts',
    'adapter/index': 'src/adapter/index.ts',
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
