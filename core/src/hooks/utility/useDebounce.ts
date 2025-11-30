"use client";

import { useEffect, useState } from "react";

/**
 * Custom hook that debounces a value
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds
 * @returns The debounced value
 *
 * @example
 * ```tsx
 * function SearchComponent() {
 *   const [searchTerm, setSearchTerm] = useState('');
 *   const debouncedSearch = useDebounce(searchTerm, 300);
 *
 *   useEffect(() => {
 *     // This only runs when debouncedSearch changes
 *     performSearch(debouncedSearch);
 *   }, [debouncedSearch]);
 *
 *   return <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />;
 * }
 * ```
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
