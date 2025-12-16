/**
 * AuthProvider Component Factory
 *
 * Factory to create an authentication provider wrapper component.
 */

'use client';

import * as React from 'react';
import { type ReactNode } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface AuthProviderConfig {
  /**
   * The session provider component from your auth library (e.g., NextAuth's SessionProvider)
   */
  SessionProvider: React.ComponentType<{
    children: ReactNode;
    refetchInterval?: number;
    refetchOnWindowFocus?: boolean;
    refetchWhenOffline?: boolean;
  }>;
  /**
   * Interval in seconds to refetch the session (default: 5 minutes)
   */
  refetchInterval?: number;
  /**
   * Whether to refetch session on window focus (default: false)
   */
  refetchOnWindowFocus?: boolean;
  /**
   * Whether to refetch session when offline (default: false)
   */
  refetchWhenOffline?: boolean;
}

export interface AuthProviderProps {
  children: ReactNode;
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create an AuthProvider component
 *
 * @example
 * // Create the AuthProvider with your dependencies
 * import { SessionProvider } from 'next-auth/react';
 *
 * const AuthProvider = createAuthProvider({
 *   SessionProvider,
 *   refetchInterval: 5 * 60, // 5 minutes
 *   refetchOnWindowFocus: false,
 * });
 *
 * // Usage in layout:
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 */
export function createAuthProvider(config: AuthProviderConfig) {
  const {
    SessionProvider,
    refetchInterval = 5 * 60, // 5 minutes in seconds
    refetchOnWindowFocus = false,
    refetchWhenOffline = false,
  } = config;

  return function AuthProvider({ children }: AuthProviderProps) {
    return (
      <SessionProvider
        refetchInterval={refetchInterval}
        refetchOnWindowFocus={refetchOnWindowFocus}
        refetchWhenOffline={refetchWhenOffline}
      >
        {children}
      </SessionProvider>
    );
  };
}

// =============================================================================
// SIMPLE VERSION (for direct use with NextAuth)
// =============================================================================

/**
 * A simple AuthProvider wrapper for NextAuth
 * Use this if you're using NextAuth and want a pre-configured provider
 *
 * @example
 * // In your app:
 * import { SessionProvider } from 'next-auth/react';
 * import { SimpleAuthProvider } from '@jetdevs/core/ui/auth';
 *
 * function RootLayout({ children }) {
 *   return (
 *     <SimpleAuthProvider SessionProvider={SessionProvider}>
 *       {children}
 *     </SimpleAuthProvider>
 *   );
 * }
 */
export interface SimpleAuthProviderProps {
  children: ReactNode;
  SessionProvider: React.ComponentType<{
    children: ReactNode;
    refetchInterval?: number;
    refetchOnWindowFocus?: boolean;
    refetchWhenOffline?: boolean;
  }>;
  refetchInterval?: number;
  refetchOnWindowFocus?: boolean;
  refetchWhenOffline?: boolean;
}

export function SimpleAuthProvider({
  children,
  SessionProvider,
  refetchInterval = 5 * 60,
  refetchOnWindowFocus = false,
  refetchWhenOffline = false,
}: SimpleAuthProviderProps) {
  return (
    <SessionProvider
      refetchInterval={refetchInterval}
      refetchOnWindowFocus={refetchOnWindowFocus}
      refetchWhenOffline={refetchWhenOffline}
    >
      {children}
    </SessionProvider>
  );
}
