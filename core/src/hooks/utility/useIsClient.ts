/**
 * Client Detection Hook
 *
 * Simple hook to detect if running on client side (after hydration).
 * Useful for avoiding hydration mismatches with browser-only features.
 */

'use client';

import { useState, useEffect } from 'react';

/**
 * Hook to detect if we're on the client side
 *
 * @example
 * function MyComponent() {
 *   const isClient = useIsClient();
 *
 *   if (!isClient) {
 *     return <div>Loading...</div>;
 *   }
 *
 *   return <div>Client-side content: {window.innerWidth}px</div>;
 * }
 */
export function useIsClient(): boolean {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
}
