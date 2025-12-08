import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/s3.ts'],
  format: ['cjs', 'esm'],
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
  ],
});
