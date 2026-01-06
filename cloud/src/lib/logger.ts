/**
 * SDK Logger
 *
 * Provides consistent logging with environment-aware output.
 * Logs are prefixed with [@jetdevs/cloud] for easy filtering.
 */

import { detectEnvironment } from './env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_PREFIX = '[@jetdevs/cloud]';

/**
 * Check if debug logging is enabled
 */
function isDebugEnabled(): boolean {
  return process.env.YOBO_DEBUG === 'true' || (process.env.DEBUG?.includes('yobo') ?? false);
}

/**
 * Format log message with context
 */
function formatMessage(level: LogLevel, module: string, message: string, context?: Record<string, unknown>): string {
  const env = detectEnvironment();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  const envTag = env ? `[${env}]` : '';
  return `${LOG_PREFIX}${envTag}[${module}] ${message}${contextStr}`;
}

/**
 * Logger instance for SDK modules
 */
export const logger = {
  debug(module: string, message: string, context?: Record<string, unknown>): void {
    if (isDebugEnabled()) {
      console.debug(formatMessage('debug', module, message, context));
    }
  },

  info(module: string, message: string, context?: Record<string, unknown>): void {
    console.info(formatMessage('info', module, message, context));
  },

  warn(module: string, message: string, context?: Record<string, unknown>): void {
    console.warn(formatMessage('warn', module, message, context));
  },

  error(module: string, message: string, error?: Error, context?: Record<string, unknown>): void {
    const errorContext = {
      ...context,
      ...(error && {
        errorName: error.name,
        errorMessage: error.message,
        stack: isDebugEnabled() ? error.stack : undefined,
      }),
    };
    console.error(formatMessage('error', module, message, errorContext));
  },
};

/**
 * Create a module-specific logger
 */
export function createLogger(module: string) {
  return {
    debug: (message: string, context?: Record<string, unknown>) => logger.debug(module, message, context),
    info: (message: string, context?: Record<string, unknown>) => logger.info(module, message, context),
    warn: (message: string, context?: Record<string, unknown>) => logger.warn(module, message, context),
    error: (message: string, error?: Error, context?: Record<string, unknown>) => logger.error(module, message, error, context),
  };
}
