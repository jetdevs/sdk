import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'config/index': 'src/config/index.ts',
    'storage/index': 'src/storage/index.ts',
    'lib/index': 'src/lib/index.ts',
    'whatsapp/index': 'src/whatsapp/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false, // Keep readable for debugging
  splitting: false,
  treeshake: true,
  external: [
    '@aws-sdk/client-s3',
    '@aws-sdk/lib-storage',
    '@aws-sdk/s3-request-presigner',
    'zod',
  ],
});
