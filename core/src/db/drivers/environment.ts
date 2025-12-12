/**
 * Environment Detection and Driver Recommendation
 *
 * Utilities for detecting the runtime environment and
 * recommending the appropriate database driver.
 *
 * @module @yobolabs/core/db/drivers/environment
 */

import type {
  RuntimeEnvironment,
  DriverDetectionResult,
  DatabaseDriver,
  DatabaseDialect,
} from './types';

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

/**
 * Detect the current runtime environment
 *
 * @returns Runtime environment information
 *
 * @example
 * ```typescript
 * const env = detectEnvironment();
 *
 * if (env.isServerless) {
 *   console.log('Running in serverless environment');
 * }
 *
 * if (env.isVercel) {
 *   console.log('Deploying on Vercel');
 * }
 * ```
 */
export function detectEnvironment(): RuntimeEnvironment {
  // Check for various runtime environments
  const isVercel = Boolean(
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.VERCEL_URL
  );

  const isAWSLambda = Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env._HANDLER
  );

  const isEdge = Boolean(
    // Vercel Edge
    process.env.EDGE_RUNTIME ||
    // Check for EdgeRuntime global (Vercel)
    (typeof globalThis !== 'undefined' && 'EdgeRuntime' in globalThis) ||
    // Cloudflare Workers
    (typeof globalThis !== 'undefined' && 'caches' in globalThis && typeof (globalThis as any).caches?.default !== 'undefined')
  );

  const isCloudflareWorkers = Boolean(
    (typeof globalThis !== 'undefined' && 'caches' in globalThis) &&
    typeof process === 'undefined'
  );

  const isNetlify = Boolean(
    process.env.NETLIFY ||
    process.env.NETLIFY_DEV
  );

  const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT);

  const isRender = Boolean(process.env.RENDER);

  const isFly = Boolean(process.env.FLY_APP_NAME);

  // Determine if serverless (any serverless-like environment)
  const isServerless = isVercel || isAWSLambda || isEdge || isCloudflareWorkers || isNetlify;

  // Check for Node.js
  const isNode = typeof process !== 'undefined' &&
    process.versions?.node !== undefined &&
    !isEdge;

  // Check environment mode
  const isDevelopment = process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test';

  const isProduction = process.env.NODE_ENV === 'production';

  return {
    isServerless,
    isVercel,
    isAWSLambda,
    isEdge,
    isNode,
    isDevelopment,
    isProduction,
  };
}

// =============================================================================
// CONNECTION URL PARSING
// =============================================================================

/**
 * Parsed database connection URL
 */
export interface ParsedConnectionUrl {
  /**
   * The database protocol/dialect
   */
  dialect: DatabaseDialect | 'unknown';

  /**
   * The hostname
   */
  host: string;

  /**
   * The port (if specified)
   */
  port?: number;

  /**
   * The database name
   */
  database: string;

  /**
   * The username
   */
  username?: string;

  /**
   * Whether the URL looks like a Neon connection
   */
  isNeon: boolean;

  /**
   * Whether the URL looks like a PlanetScale connection
   */
  isPlanetScale: boolean;

  /**
   * Whether the URL looks like an AWS RDS connection
   */
  isAWSRDS: boolean;

  /**
   * Whether the URL is using a connection pooler
   */
  isPooler: boolean;

  /**
   * Query parameters from the URL
   */
  params: Record<string, string>;
}

/**
 * Parse a database connection URL to extract information
 *
 * @param url - The database connection URL
 * @returns Parsed connection information
 *
 * @example
 * ```typescript
 * const info = parseConnectionUrl('postgresql://user:pass@host.neon.tech/db');
 * console.log(info.isNeon); // true
 * console.log(info.dialect); // 'postgresql'
 * ```
 */
export function parseConnectionUrl(url: string): ParsedConnectionUrl {
  try {
    const parsed = new URL(url);

    // Determine dialect from protocol
    let dialect: DatabaseDialect | 'unknown' = 'unknown';
    const protocol = parsed.protocol.replace(':', '');

    if (['postgres', 'postgresql'].includes(protocol)) {
      dialect = 'postgresql';
    } else if (['mysql', 'mysql2', 'mariadb'].includes(protocol)) {
      dialect = 'mysql';
    } else if (['file', 'sqlite', 'sqlite3'].includes(protocol)) {
      dialect = 'sqlite';
    }

    // Parse query parameters
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    // Detect providers
    const host = parsed.hostname.toLowerCase();
    const isNeon = host.includes('neon.tech') ||
      host.includes('neon-') ||
      host.includes('.neon.');

    const isPlanetScale = host.includes('planetscale') ||
      host.includes('psdb.cloud') ||
      host.includes('aws.connect.psdb.cloud');

    const isAWSRDS = host.includes('.rds.') ||
      host.includes('.rds-') ||
      host.includes('amazonaws.com');

    // Check if using a pooler
    const isPooler = host.includes('-pooler') ||
      params.pgbouncer === 'true' ||
      params.pooler === 'true' ||
      // Neon pooled connections
      host.includes('pooler.') ||
      // Supabase pooler
      host.includes('.pooler.');

    return {
      dialect,
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : undefined,
      database: parsed.pathname.slice(1), // Remove leading /
      username: parsed.username || undefined,
      isNeon,
      isPlanetScale,
      isAWSRDS,
      isPooler,
      params,
    };
  } catch {
    // If URL parsing fails, return defaults
    return {
      dialect: 'unknown',
      host: '',
      database: '',
      isNeon: false,
      isPlanetScale: false,
      isAWSRDS: false,
      isPooler: false,
      params: {},
    };
  }
}

// =============================================================================
// DRIVER RECOMMENDATION
// =============================================================================

/**
 * Recommend the best database driver based on environment and connection URL
 *
 * @param url - The database connection URL (optional)
 * @returns Driver recommendation with reasoning
 *
 * @example
 * ```typescript
 * const recommendation = recommendDriver(process.env.DATABASE_URL);
 *
 * console.log(recommendation.recommendedDriver); // e.g., 'neon-http'
 * console.log(recommendation.reason);
 * ```
 */
export function recommendDriver(url?: string): DriverDetectionResult {
  const env = detectEnvironment();
  const urlInfo = url ? parseConnectionUrl(url) : null;

  // Check for explicit driver override in environment
  const explicitDriver = process.env.DATABASE_DRIVER as DatabaseDriver | undefined;
  if (explicitDriver) {
    return {
      recommendedDriver: explicitDriver,
      reason: 'DATABASE_DRIVER environment variable is set',
      alternatives: [],
    };
  }

  // Handle PlanetScale
  if (urlInfo?.isPlanetScale) {
    return {
      recommendedDriver: 'planetscale',
      reason: 'PlanetScale connection detected from URL',
      alternatives: ['mysql2'],
    };
  }

  // Handle non-PostgreSQL dialects
  if (urlInfo?.dialect === 'mysql') {
    if (env.isServerless) {
      return {
        recommendedDriver: 'planetscale',
        reason: 'MySQL in serverless environment - PlanetScale driver recommended',
        alternatives: ['mysql2'],
      };
    }
    return {
      recommendedDriver: 'mysql2',
      reason: 'MySQL connection detected',
      alternatives: [],
    };
  }

  if (urlInfo?.dialect === 'sqlite') {
    return {
      recommendedDriver: 'libsql',
      reason: 'SQLite connection detected - LibSQL recommended for edge compatibility',
      alternatives: ['better-sqlite3'],
    };
  }

  // PostgreSQL driver selection

  // Neon in serverless environment
  if (urlInfo?.isNeon && env.isServerless) {
    if (env.isEdge) {
      return {
        recommendedDriver: 'neon-http',
        reason: 'Neon connection in edge runtime - HTTP driver required',
        alternatives: [],
        warnings: ['Transactions not supported in HTTP mode. Use neon-ws if needed.'],
      };
    }

    return {
      recommendedDriver: 'neon-http',
      reason: 'Neon connection in serverless environment - HTTP driver optimal',
      alternatives: ['neon-ws', 'postgres'],
      warnings: [
        'Use neon-ws if you need transaction support.',
        'postgres driver works but may have cold start issues.',
      ],
    };
  }

  // Neon in traditional server
  if (urlInfo?.isNeon && !env.isServerless) {
    return {
      recommendedDriver: 'postgres',
      reason: 'Neon connection in traditional server - postgres.js recommended',
      alternatives: ['neon-ws', 'pg-pool'],
    };
  }

  // Generic serverless PostgreSQL (not Neon)
  if (env.isServerless && urlInfo?.dialect === 'postgresql') {
    if (env.isEdge) {
      return {
        recommendedDriver: 'neon-http',
        reason: 'Edge runtime detected - Neon HTTP driver recommended for PostgreSQL',
        alternatives: [],
        warnings: [
          'Consider using Neon database for optimal edge performance.',
          'Traditional PostgreSQL may have connection issues in edge runtime.',
        ],
      };
    }

    return {
      recommendedDriver: 'postgres',
      reason: 'Serverless PostgreSQL - postgres.js with careful connection management',
      alternatives: ['pg-pool'],
      warnings: [
        'Monitor connection usage in serverless.',
        'Consider Neon for serverless-optimized PostgreSQL.',
      ],
    };
  }

  // AWS RDS
  if (urlInfo?.isAWSRDS) {
    return {
      recommendedDriver: 'pg-pool',
      reason: 'AWS RDS detected - node-postgres with pooling recommended',
      alternatives: ['postgres'],
    };
  }

  // Traditional PostgreSQL server
  if (urlInfo?.dialect === 'postgresql' || !urlInfo) {
    if (urlInfo?.isPooler) {
      return {
        recommendedDriver: 'postgres',
        reason: 'Connection pooler detected - postgres.js recommended',
        alternatives: ['pg-pool'],
        warnings: ['Disable prepared statements when using external pooler.'],
      };
    }

    return {
      recommendedDriver: 'postgres',
      reason: 'Traditional PostgreSQL - postgres.js recommended for best performance',
      alternatives: ['pg-pool'],
    };
  }

  // Development environment fallback
  if (env.isDevelopment) {
    return {
      recommendedDriver: 'postgres',
      reason: 'Development environment - postgres.js for best DX',
      alternatives: ['pg-pool'],
    };
  }

  // Default fallback
  return {
    recommendedDriver: 'postgres',
    reason: 'Default recommendation - postgres.js',
    alternatives: ['pg-pool', 'neon-http'],
  };
}

// =============================================================================
// ENVIRONMENT VARIABLE HELPERS
// =============================================================================

/**
 * Get database URL from environment variables
 *
 * Checks multiple common environment variable names.
 *
 * @returns Database URL or undefined
 */
export function getDatabaseUrlFromEnv(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.PG_URL ||
    process.env.DB_URL
  );
}

/**
 * Get database driver from environment variables
 *
 * @returns Database driver or undefined
 */
export function getDatabaseDriverFromEnv(): DatabaseDriver | undefined {
  const driver = process.env.DATABASE_DRIVER;
  if (!driver) return undefined;

  // Validate it's a known driver
  const knownDrivers: DatabaseDriver[] = [
    'postgres',
    'neon-http',
    'neon-ws',
    'pg',
    'pg-pool',
    'planetscale',
    'mysql2',
    'better-sqlite3',
    'libsql',
  ];

  if (knownDrivers.includes(driver as DatabaseDriver)) {
    return driver as DatabaseDriver;
  }

  console.warn(
    `Unknown DATABASE_DRIVER: "${driver}". ` +
    `Valid options: ${knownDrivers.join(', ')}`
  );

  return undefined;
}
