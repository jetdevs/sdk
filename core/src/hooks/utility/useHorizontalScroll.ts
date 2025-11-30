'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface ScrollState {
  isScrollable: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

export interface UseHorizontalScrollReturn {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  scrollState: ScrollState;
}

/**
 * Hook to detect horizontal scroll state of a container.
 * Returns scroll state and ref to attach to the scrollable element.
 *
 * @example
 * ```tsx
 * const { scrollRef, scrollState } = useHorizontalScroll();
 *
 * return (
 *   <div ref={scrollRef} className="overflow-x-auto">
 *     {scrollState.canScrollLeft && <LeftIndicator />}
 *     <Content />
 *     {scrollState.canScrollRight && <RightIndicator />}
 *   </div>
 * );
 * ```
 */
export function useHorizontalScroll(): UseHorizontalScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<ScrollState>({
    isScrollable: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const { scrollLeft, scrollWidth, clientWidth } = element;
    const isScrollable = scrollWidth > clientWidth;
    const canScrollLeft = scrollLeft > 0;
    const canScrollRight = scrollLeft < scrollWidth - clientWidth - 1; // -1 for rounding

    setScrollState({
      isScrollable,
      canScrollLeft,
      canScrollRight,
    });
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    // Initial check
    updateScrollState();

    // Update on scroll
    element.addEventListener('scroll', updateScrollState);

    // Update on resize
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener('scroll', updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState]);

  return { scrollRef, scrollState };
}
