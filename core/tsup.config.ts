import { defineConfig, type Options } from 'tsup'

// Entry points that contain React hooks and need "use client" directive
const clientEntries = [
  'ui/index',
  'ui/primitives/index',
  'ui/data-table/index',
  'ui/layout/index',
  'ui/auth/index',
  'ui/feedback/index',
  'ui/display/index',
  'ui/skeletons/index',
  'ui/theme/index',
  'ui/admin/index',
  'hooks/index',
  'stores/index',
  'providers/index',
]

// Server-only entry points (no React hooks)
const serverEntries = {
  index: 'src/index.ts',
  'db/index': 'src/db/index.ts',
  'db/schema/index': 'src/db/schema/index.ts',
  'db/seeds/index': 'src/db/seeds/index.ts',
  'auth/index': 'src/modules/auth/index.ts',
  'auth/providers/index': 'src/modules/auth/providers/index.ts',
  'trpc/index': 'src/trpc/index.ts',
  'trpc/routers/index': 'src/trpc/routers/index.ts',
  'permissions/index': 'src/modules/permissions/index.ts',
  'rbac/index': 'src/modules/rbac/index.ts',
  'themes/index': 'src/modules/themes/index.ts',
  'lib/index': 'src/lib/index.ts',
  'rls/index': 'src/rls/index.ts',
  'cli/index': 'src/cli/index.ts',
  'cli/db': 'src/cli/db.ts',
  'config/index': 'src/config/index.ts',
  'api-keys/index': 'src/modules/api-keys/index.ts',
  'system-config/index': 'src/modules/system-config/index.ts',
  'users/index': 'src/modules/users/index.ts',
  'organizations/index': 'src/modules/organizations/index.ts',
  'user-org/index': 'src/modules/user-org/index.ts',
  'middleware/index': 'src/middleware/index.ts',
  'db/drivers/index': 'src/db/drivers/index.ts',
}

// Client entry points with their source paths
const clientEntryPaths = clientEntries.reduce((acc, entry) => {
  acc[entry] = `src/${entry}.ts`
  return acc
}, {} as Record<string, string>)

// Common external dependencies
const externalDeps = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'next',
  'next-auth',
  'drizzle-orm',
  '@trpc/server',
  '@trpc/client',
  'postgres',
  'react-hook-form',
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-label',
  '@radix-ui/react-select',
  '@radix-ui/react-slot',
  '@radix-ui/react-tabs',
  '@radix-ui/react-tooltip',
  '@radix-ui/react-checkbox',
  '@radix-ui/react-scroll-area',
  'class-variance-authority',
  'lucide-react',
  '@tanstack/react-table',
  '@tanstack/react-query',
  'libphonenumber-js',
  'zustand',
  'immer',
  '@jetdevs/framework',
  '@neondatabase/serverless',
  '@planetscale/database',
  'mysql2',
  'pg',
  'drizzle-orm/postgres-js',
  'drizzle-orm/neon-http',
  'drizzle-orm/neon-serverless',
  'drizzle-orm/node-postgres',
  'drizzle-orm/planetscale-serverless',
  'drizzle-orm/mysql2',
]

// All entries combined for single build
// This avoids race conditions and file deletion issues when running parallel builds
const allEntries: Record<string, string> = {
  ...serverEntries,
  ...clientEntryPaths,
}

// Single build config that handles both server and client entries
// Note: We can't use banner for selective client entries in a single build,
// so we need to add "use client" manually or use a different approach
const combinedConfig: Options = {
  entry: allEntries,
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  external: externalDeps,
  // Use esbuildOptions to add "use client" banner to specific files
  esbuildPlugins: [
    {
      name: 'add-use-client',
      setup(build) {
        build.onEnd(async (result) => {
          // We'll handle this via the banner option per-file
        })
      },
    },
  ],
  // Add "use client" banner to client entries using onSuccess
  async onSuccess() {
    const fs = await import('fs/promises')
    const path = await import('path')
    const distPath = path.resolve(process.cwd(), 'dist')

    for (const entry of clientEntries) {
      const filePath = path.join(distPath, `${entry}.js`)
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        if (!content.startsWith('"use client"')) {
          await fs.writeFile(filePath, `"use client";\n${content}`)
        }
      } catch (err) {
        // File might not exist for some entries
      }
    }
  },
}

export default defineConfig([combinedConfig])
