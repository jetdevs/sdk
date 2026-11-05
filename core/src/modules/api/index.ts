/**
 * REST API kit — `@jetdevs/core/api` (server-only).
 *
 * Guard (`withApiAuth`), error envelope, CORS/cache helpers, Idempotency-Key
 * middleware and one-source OpenAPI 3.1 (`defineRoute` +
 * `buildOpenApiDocument` + `assertRoutesDocumented`). Auth lookups, RLS
 * context and stores are injected by the app.
 *
 * @module @jetdevs/core/api
 */

export * from './errors';
export * from './cors';
export * from './cache';
export * from './auth';
export * from './idempotency';
export * from './keys';
export * from './openapi';
