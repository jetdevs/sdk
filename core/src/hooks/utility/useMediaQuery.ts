"use client";

import { useState, useEffect } from "react";

/**
 * Custom hook that tracks if a media query matches
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 * @returns Boolean indicating if the media query matches
 *
 * @example
 * ```tsx
 * function ResponsiveComponent() {
 *   const isMobile = useMediaQuery('(max-width: 768px)');
 *   const isDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
 *
 *   return (
 *     <div>
 *       {isMobile ? <MobileLayout /> : <DesktopLayout />}
 *       {isDarkMode && <p>Dark mode is enabled</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [matches, query]);

  return matches;
}

/**
 * Predefined breakpoint media queries for common screen sizes
 */
export const BREAKPOINT_QUERIES = {
  sm: "(min-width: 640px)",
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
  xl: "(min-width: 1280px)",
  "2xl": "(min-width: 1536px)",
  mobile: "(max-width: 767px)",
  tablet: "(min-width: 768px) and (max-width: 1023px)",
  desktop: "(min-width: 1024px)",
  darkMode: "(prefers-color-scheme: dark)",
  lightMode: "(prefers-color-scheme: light)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
} as const;
