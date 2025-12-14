/**
 * Database Module
 *
 * Core database functionality and schema exports.
 */

// Client (basic)
export {
  createDbClient,
  createExtendedDbClient,
  createRawClient,
} from './client';

export type {
  DbConfig,
  DbClient,
} from './client';

// Client Factory (advanced - with privileged/admin clients)
export {
  createDbClients,
  createDbClientsFromEnv,
} from './client-factory';

export type {
  PoolConfig,
  DbClientFactoryConfig,
  DbClients,
} from './client-factory';

// Driver Abstraction Layer (advanced - multi-driver support)
export * from './drivers';

// Schema
export * as schema from './schema';
export * from './schema';
