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
