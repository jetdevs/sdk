"use client";

import * as React from "react";
import { cn } from "../../lib";
import type { CircularProgressProps } from "./types";
import { CIRCULAR_PROGRESS_COLOR_VARIANTS } from "./types";

/**
 * CircularProgress component for displaying progress in a circular format.
 *
 * This is a pure SVG component with no external UI dependencies,
 * so it doesn't need a factory pattern.
 *
 * @example
 * ```tsx
 * import { CircularProgress } from '@yobolabs/core/ui/feedback';
 *
 * // Basic usage
 * <CircularProgress value={75} />
 *
 * // With custom size and color
 * <CircularProgress value={50} size={120} color="green" />
 *
 * // With custom content
 * <CircularProgress value={100} showValue={false}>
 *   <CheckIcon className="h-6 w-6" />
 * </CircularProgress>
 * ```
 */
export function CircularProgress({
  value,
  size = 80,
  strokeWidth = 8,
  className,
  showValue = true,
  color = "blue",
  children,
}: CircularProgressProps) {
  // Clamp value between 0 and 100
  const clampedValue = Math.min(100, Math.max(0, value));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedValue / 100) * circumference;
  const colors = CIRCULAR_PROGRESS_COLOR_VARIANTS[color];

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center",
        className
      )}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle (track) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={cn("fill-none", colors.track)}
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={cn(
            "fill-none transition-all duration-500 ease-out",
            colors.progress
          )}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      {/* Center content */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center",
          colors.text
        )}
      >
        {children
          ? children
          : showValue && (
              <span className="text-sm font-bold">
                {Math.round(clampedValue)}%
              </span>
            )}
      </div>
    </div>
  );
}
