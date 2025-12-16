# NPM Publishing Guide

## Registry

All `@jetdevs/*` packages publish to **GitHub Packages** (not public npm).

```
https://npm.pkg.github.com
```

## Configuration

### 1. Root `.npmrc` (required)

Create `/monorepo/.npmrc`:

```
@jetdevs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Or use environment variable:
```
@jetdevs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

### 2. Package `publishConfig` (required in each package.json)

```json
{
  "name": "@jetdevs/package-name",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  },
  "files": ["dist", "README.md"]
}
```

### 3. GitHub Token

Generate at: https://github.com/settings/tokens

Required scopes:
- `write:packages`
- `read:packages`

## Commands (run from monorepo root)

```bash
# Build all packages
pnpm build

# Build individual package
pnpm build:framework
pnpm build:core
pnpm build:cloud

# Publish all packages
pnpm publish:packages

# Dry run (test without publishing)
pnpm publish:dry-run

# Publish single package
pnpm --filter @jetdevs/core publish --no-git-checks
```

## Version Bumping

Before publishing a new version, update the version in `package.json`:

```bash
# In the package directory
cd packages/core
npm version patch  # 0.1.0 -> 0.1.1
npm version minor  # 0.1.0 -> 0.2.0
npm version major  # 0.1.0 -> 1.0.0
```

Or manually edit `"version"` in `package.json`.

## Package Dependencies

`@jetdevs/core` depends on `@jetdevs/framework`. Publishing order matters:

1. Publish `framework` first
2. Then publish `core`

The `publish:packages` script handles this automatically via turbo's dependency graph.

## GitHub Actions (CI/CD)

Workflow at `.github/workflows/publish-packages.yml`:

- **Auto-publish**: Triggers on push to `main` when package version changes
- **Manual publish**: Go to Actions > "Publish SDK Packages" > Run workflow

## Troubleshooting

### "need auth" error
- Check `.npmrc` exists at monorepo root
- Verify token has `write:packages` scope
- Token must not be expired

### "already exists" error
- Version already published; bump version first

### Package not found after publish
- GitHub Packages can take 1-2 minutes to propagate
- Ensure you're authenticated when installing: `npm login --registry=https://npm.pkg.github.com`

## Installing Published Packages

Consumers need `.npmrc` with read access:

```
@jetdevs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_READ_TOKEN
```

Then install normally:
```bash
pnpm add @jetdevs/core @jetdevs/framework
```
