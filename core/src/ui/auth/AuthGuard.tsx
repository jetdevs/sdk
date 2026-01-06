/**
 * AuthGuard Component Factory
 *
 * Factory to create an authentication guard component that protects
 * routes/content from unauthenticated users.
 */

'use client';

import * as React from 'react';
import { type ReactNode, useEffect, useState, useRef } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface AuthGuardConfig {
  /**
   * Hook that returns session status and data
   */
  useSession: () => {
    data: { user?: { id?: string | number } } | null;
    status: 'loading' | 'authenticated' | 'unauthenticated';
  };
  /**
   * Sign out function
   */
  signOut: (options?: { redirect?: boolean }) => Promise<void>;
  /**
   * Router push/replace function for navigation
   */
  routerReplace: (url: string) => void;
  /**
   * Optional toast notification function
   */
  toast?: (options: {
    type: 'warning' | 'error' | 'success';
    title: string;
    description?: string;
    duration?: number;
  }) => void;
  /**
   * Default fallback component to show during loading
   */
  LoadingFallback?: React.ComponentType;
  /**
   * Login path for redirect
   */
  loginPath?: string;
  /**
   * Timeout in milliseconds before showing error state
   */
  loadingTimeout?: number;
}

export interface AuthGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create an AuthGuard component
 *
 * @example
 * // Create the AuthGuard with your dependencies
 * import { useSession, signOut } from 'next-auth/react';
 * import { useRouter } from 'next/navigation';
 * import { toast } from 'sonner';
 * import { AppSkeleton } from '@/components/layout/AppSkeleton';
 *
 * const AuthGuard = createAuthGuard({
 *   useSession,
 *   signOut,
 *   routerReplace: useRouter().replace,
 *   toast: (opts) => toast[opts.type](opts.title, { description: opts.description }),
 *   LoadingFallback: AppSkeleton,
 *   loginPath: '/login',
 * });
 *
 * // Usage:
 * <AuthGuard>
 *   <ProtectedContent />
 * </AuthGuard>
 */
export function createAuthGuard(config: AuthGuardConfig) {
  const {
    useSession,
    signOut,
    routerReplace,
    toast,
    LoadingFallback,
    loginPath = '/login',
    loadingTimeout = 10000,
  } = config;

  return function AuthGuard({ children, fallback }: AuthGuardProps): React.ReactElement | null {
    const { data: session, status } = useSession();
    const [loadingTimedOut, setLoadingTimedOut] = useState(false);

    // Extract stable values to avoid unnecessary re-executions
    const userId = session?.user?.id;
    const hasSession = !!session;

    // Track state changes to avoid duplicate operations
    const prevStatusRef = useRef<string>('');
    const prevUserIdRef = useRef<string | number | undefined>(undefined);
    const toastShownRef = useRef<boolean>(false);
    const signOutCalledRef = useRef<boolean>(false);

    // Add timeout for loading state to prevent infinite loading
    useEffect(() => {
      const timer = setTimeout(() => {
        if (status === 'loading') {
          console.error('AuthGuard: Authentication check timed out after', loadingTimeout / 1000, 'seconds');
          setLoadingTimedOut(true);
        }
      }, loadingTimeout);

      return () => clearTimeout(timer);
    }, [status]);

    // Handle authentication state changes
    useEffect(() => {
      const statusChanged = prevStatusRef.current !== status;
      const userIdChanged = prevUserIdRef.current !== userId;

      // Only log on actual changes, not every render
      if (statusChanged || userIdChanged) {
        // Update refs first to prevent duplicate logs
        prevStatusRef.current = status;
        prevUserIdRef.current = userId;

        // Only log in development and only for meaningful changes
        if (process.env.NODE_ENV === 'development' && (statusChanged || (userIdChanged && userId))) {
          console.log('AuthGuard status change:', {
            status,
            hasSession,
            userId: userId || 'none',
          });
        }
      }

      if (status === 'loading') return;

      if (status === 'unauthenticated') {

        // Clear expired/invalid cookies to prevent auth loops
        if (!signOutCalledRef.current) {
          signOutCalledRef.current = true;

          // Show toast warning only once
          if (!toastShownRef.current && toast) {
            toastShownRef.current = true;
            toast({
              type: 'warning',
              title: 'Authentication Required',
              description: 'Please log in again',
              duration: 2000,
            });
          }

          // Call signOut to clear all auth cookies
          signOut({ redirect: false })
            .then(() => {
              // After cookies are cleared, redirect to login
              const currentPath =
                typeof window !== 'undefined'
                  ? window.location.pathname + window.location.search
                  : '/';
              const loginUrl = `${loginPath}?callbackUrl=${encodeURIComponent(currentPath)}`;
              routerReplace(loginUrl);
            })
            .catch((error) => {
              console.error('Error during signOut:', error);
              // Still redirect even if signOut fails
              const currentPath =
                typeof window !== 'undefined'
                  ? window.location.pathname + window.location.search
                  : '/';
              const loginUrl = `${loginPath}?callbackUrl=${encodeURIComponent(currentPath)}`;
              routerReplace(loginUrl);
            });
        }
        return;
      }

      if (status === 'authenticated' && userId && userIdChanged) {
        // Reset flags when user is authenticated again
        signOutCalledRef.current = false;
        toastShownRef.current = false;
      }
    }, [status, hasSession, userId]);

    // Show error state if loading times out
    if (loadingTimedOut) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="text-red-500 mb-4">Authentication Error</div>
            <p className="text-sm text-muted-foreground mb-4">
              Authentication check timed out. Please try refreshing the page.
            </p>
            <button
              onClick={() => typeof window !== 'undefined' && window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    // Show loading state while checking authentication
    if (status === 'loading') {
      if (fallback) {
        return <>{fallback}</>;
      }
      if (LoadingFallback) {
        return <LoadingFallback />;
      }
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="animate-pulse">Loading...</div>
        </div>
      );
    }

    // Show nothing while redirecting
    if (status === 'unauthenticated') {
      return <></>;
    }

    // User is authenticated, show the protected content
    return <>{children}</>;
  };
}
