/**
 * Permission Check Hook with Real-time Updates
 *
 * This hook provides permission checking with optional SSE-based real-time updates.
 * Applications can provide their own connection management or use the built-in SSE support.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface PermissionCheckOptions {
  /**
   * Whether real-time updates are enabled
   */
  enableRealtime?: boolean;
  /**
   * SSE endpoint URL for real-time permission updates
   */
  sseEndpoint?: string;
  /**
   * Reconnection delay in ms (default: 5000)
   */
  reconnectDelay?: number;
  /**
   * Whether the user is authenticated (required for SSE connection)
   */
  isAuthenticated?: boolean;
}

export interface SSEPermissionMessage {
  type: 'CONNECTED' | 'PERMISSION_UPDATE' | 'HEARTBEAT';
  permissions?: string[];
  [key: string]: unknown;
}

export interface UsePermissionCheckResult {
  hasPermission: boolean;
  isConnected: boolean;
}

// =============================================================================
// SSE CONNECTION HOOK
// =============================================================================

/**
 * Hook to manage SSE connection for real-time permission updates
 */
export function usePermissionSSE(options: {
  endpoint: string;
  isAuthenticated: boolean;
  onPermissionUpdate: (permissions: string[]) => void;
  reconnectDelay?: number;
}) {
  const { endpoint, isAuthenticated, onPermissionUpdate, reconnectDelay = 5000 } = options;
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      cleanup();
      return;
    }

    // Only create one SSE connection
    if (eventSourceRef.current) return;

    const setupSSE = () => {
      try {
        const eventSource = new EventSource(endpoint);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          if (process.env.NODE_ENV === 'development') {
            console.log('SSE connection established for real-time permissions');
          }
          setIsConnected(true);
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as SSEPermissionMessage;

            if (data.type === 'CONNECTED') {
              if (process.env.NODE_ENV === 'development') {
                console.log('SSE connected:', data);
              }
            } else if (data.type === 'PERMISSION_UPDATE' && data.permissions) {
              if (process.env.NODE_ENV === 'development') {
                console.log('Received real-time permission update:', data.permissions);
              }
              onPermissionUpdate(data.permissions);
            }
          } catch (error) {
            console.error('Error parsing SSE message:', error);
          }
        };

        eventSource.onerror = () => {
          console.error('SSE connection error');
          setIsConnected(false);

          // Clean up and attempt reconnection
          eventSource.close();
          eventSourceRef.current = null;

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isAuthenticated) {
              setupSSE();
            }
          }, reconnectDelay);
        };
      } catch (error) {
        console.error('Error setting up SSE connection:', error);
      }
    };

    setupSSE();

    return cleanup;
  }, [isAuthenticated, endpoint, onPermissionUpdate, reconnectDelay, cleanup]);

  return { isConnected };
}

// =============================================================================
// PERMISSION CHECK HOOK FACTORY
// =============================================================================

/**
 * Create a usePermissionCheck hook bound to specific auth state
 *
 * @example
 * const usePermissionCheck = createUsePermissionCheck({
 *   getHasPermission: (perm) => authStore.hasPermission(perm),
 *   updatePermissions: (perms) => authStore.updatePermissions(perms),
 *   isAuthenticated: () => !!session?.user,
 * });
 *
 * // In a component:
 * const canEdit = usePermissionCheck('workflow:edit');
 */
export function createUsePermissionCheck(config: {
  getHasPermission: (permission: string) => boolean;
  updatePermissions: (permissions: string[]) => void;
  isAuthenticated: () => boolean;
  sseEndpoint?: string;
  enableRealtime?: boolean;
}): (permission: string, options?: PermissionCheckOptions) => UsePermissionCheckResult {
  const {
    getHasPermission,
    updatePermissions,
    isAuthenticated: getIsAuthenticated,
    sseEndpoint = '/api/ws/permissions',
    enableRealtime = false,
  } = config;

  return function usePermissionCheck(
    permission: string,
    options?: PermissionCheckOptions
  ): UsePermissionCheckResult {
    const [isConnected, setIsConnected] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);

    const shouldEnableRealtime = options?.enableRealtime ?? enableRealtime;
    const endpoint = options?.sseEndpoint ?? sseEndpoint;
    const reconnectDelay = options?.reconnectDelay ?? 5000;
    const isAuthenticated = options?.isAuthenticated ?? getIsAuthenticated();

    // Set up SSE connection for real-time permission updates
    useEffect(() => {
      if (!shouldEnableRealtime || !isAuthenticated) return;

      // Only create one SSE connection per session
      if (eventSourceRef.current) return;

      const setupSSE = () => {
        try {
          const eventSource = new EventSource(endpoint);
          eventSourceRef.current = eventSource;

          eventSource.onopen = () => {
            if (process.env.NODE_ENV === 'development') {
              console.log('SSE connection established for real-time permissions');
            }
            setIsConnected(true);
          };

          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data) as SSEPermissionMessage;

              if (data.type === 'CONNECTED') {
                if (process.env.NODE_ENV === 'development') {
                  console.log('SSE connected:', data);
                }
              } else if (data.type === 'PERMISSION_UPDATE' && data.permissions) {
                if (process.env.NODE_ENV === 'development') {
                  console.log('Received real-time permission update:', data.permissions);
                }
                updatePermissions(data.permissions);
              }
            } catch (error) {
              console.error('Error parsing SSE message:', error);
            }
          };

          eventSource.onerror = () => {
            console.error('SSE connection error');
            setIsConnected(false);

            // Clean up and attempt reconnection after a delay
            eventSource.close();
            eventSourceRef.current = null;

            setTimeout(() => {
              if (isAuthenticated) {
                setupSSE();
              }
            }, reconnectDelay);
          };
        } catch (error) {
          console.error('Error setting up SSE connection:', error);
        }
      };

      setupSSE();

      // Cleanup on unmount
      return () => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        setIsConnected(false);
      };
    }, [shouldEnableRealtime, isAuthenticated, endpoint, reconnectDelay]);

    // Return the permission check result
    return {
      hasPermission: getHasPermission(permission),
      isConnected,
    };
  };
}

// =============================================================================
// CONNECTION STATUS HOOK FACTORY
// =============================================================================

/**
 * Create a hook to check real-time permission connection status
 */
export function createUsePermissionConnectionStatus(config: {
  isAuthenticated: () => boolean;
  sseEndpoint?: string;
}): () => boolean {
  const { isAuthenticated: getIsAuthenticated, sseEndpoint = '/api/ws/permissions' } = config;

  return function usePermissionConnectionStatus(): boolean {
    const [isConnected, setIsConnected] = useState(false);
    const isAuthenticated = getIsAuthenticated();

    useEffect(() => {
      if (!isAuthenticated) {
        setIsConnected(false);
        return;
      }

      const eventSource = new EventSource(sseEndpoint);

      eventSource.onopen = () => setIsConnected(true);
      eventSource.onerror = () => setIsConnected(false);

      return () => {
        eventSource.close();
        setIsConnected(false);
      };
    }, [isAuthenticated]);

    return isConnected;
  };
}
