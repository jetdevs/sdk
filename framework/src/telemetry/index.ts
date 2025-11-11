/**
 * Telemetry & Monitoring
 *
 * Provides consistent metrics, tracing, and error tracking across all modules.
 * Integrates with observability platforms (Datadog, Sentry, etc.)
 */

import { getRLSContext } from '../rls';

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface TelemetryContext {
  operation: string;
  orgId?: number;
  userId?: string;
  metadata?: Record<string, any>;
}

interface MetricOptions {
  value?: number;
  tags?: Record<string, string>;
  unit?: string;
}

interface TelemetryResult<T> {
  result?: T;
  error?: Error;
  duration: number;
  success: boolean;
}

/**
 * Execute an operation with telemetry tracking
 *
 * @example
 * ```typescript
 * const result = await withTelemetry('product.create', async () => {
 *   return createProduct(data);
 * });
 * ```
 */
export async function withTelemetry<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Partial<TelemetryContext>
): Promise<T> {
  const startTime = performance.now();
  const rlsContext = getRLSContext();

  const telemetryContext: TelemetryContext = {
    operation,
    orgId: context?.orgId || rlsContext?.orgId,
    userId: context?.userId || rlsContext?.userId,
    metadata: context?.metadata,
  };

  let result: T;
  let error: Error | undefined;
  let success = true;

  try {
    // Track operation start
    await trackEvent(`${operation}.started`, telemetryContext);

    result = await fn();

    // Track success
    await trackEvent(`${operation}.succeeded`, telemetryContext);

    return result;
  } catch (err) {
    error = err as Error;
    success = false;

    // Track failure
    await trackEvent(`${operation}.failed`, {
      ...telemetryContext,
      error: error.message,
      stack: error.stack,
    });

    // Capture error for monitoring
    await captureError(error, telemetryContext);

    throw error;
  } finally {
    const duration = performance.now() - startTime;

    // Record metrics
    await trackMetric(`${operation}.duration`, 'histogram', {
      value: duration,
      tags: {
        success: String(success),
        org_id: String(telemetryContext.orgId || 'unknown'),
      },
    });

    await trackMetric(`${operation}.count`, 'counter', {
      tags: {
        success: String(success),
        org_id: String(telemetryContext.orgId || 'unknown'),
      },
    });

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[TELEMETRY] ${operation}`, {
        duration: `${duration.toFixed(2)}ms`,
        success,
        orgId: telemetryContext.orgId,
        error: error?.message,
      });
    }
  }
}

/**
 * Track a metric
 *
 * @example
 * ```typescript
 * await trackMetric('products.created', 'counter', {
 *   tags: { category: 'electronics' }
 * });
 * ```
 */
export async function trackMetric(
  name: string,
  type: MetricType,
  options: MetricOptions = {}
): Promise<void> {
  const { value = 1, tags = {}, unit } = options;
  const rlsContext = getRLSContext();

  // Add org context to tags
  if (rlsContext?.orgId) {
    tags.org_id = String(rlsContext.orgId);
  }

  // In production, send to metrics service (Datadog, CloudWatch, etc.)
  if (process.env.METRICS_ENABLED === 'true') {
    // TODO: Implement actual metrics sending
    // await metricsClient.send({
    //   metric: name,
    //   type,
    //   value,
    //   tags,
    //   unit,
    //   timestamp: Date.now(),
    // });
  }

  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[METRIC] ${name}`, { type, value, tags, unit });
  }
}

/**
 * Track an event
 *
 * @example
 * ```typescript
 * await trackEvent('user.login', {
 *   userId: user.id,
 *   method: 'email'
 * });
 * ```
 */
export async function trackEvent(
  name: string,
  properties?: Record<string, any>
): Promise<void> {
  const rlsContext = getRLSContext();

  const event = {
    name,
    timestamp: new Date().toISOString(),
    orgId: rlsContext?.orgId,
    userId: rlsContext?.userId,
    properties,
  };

  // In production, send to analytics service (Segment, Mixpanel, etc.)
  if (process.env.ANALYTICS_ENABLED === 'true') {
    // TODO: Implement actual event tracking
    // await analytics.track(event);
  }

  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[EVENT] ${name}`, event);
  }
}

/**
 * Capture an error for monitoring
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   await captureError(error, { operation: 'riskyOperation' });
 *   throw error;
 * }
 * ```
 */
export async function captureError(
  error: Error,
  context?: Record<string, any>
): Promise<void> {
  const rlsContext = getRLSContext();

  const errorContext = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    orgId: rlsContext?.orgId,
    userId: rlsContext?.userId,
    ...context,
  };

  // In production, send to error monitoring service (Sentry, etc.)
  if (process.env.ERROR_MONITORING_ENABLED === 'true') {
    // TODO: Implement actual error capture
    // await Sentry.captureException(error, {
    //   tags: errorContext,
    // });
  }

  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.error(`[ERROR]`, errorContext);
  }
}

/**
 * Create a traced function
 *
 * @example
 * ```typescript
 * const tracedFetch = traced('api.fetch', async (url: string) => {
 *   return fetch(url);
 * });
 * ```
 */
export function traced<TArgs extends any[], TReturn>(
  operation: string,
  fn: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    return withTelemetry(operation, () => fn(...args));
  };
}