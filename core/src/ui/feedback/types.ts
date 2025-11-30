"use client";

import * as React from "react";

// =============================================================================
// Empty State Types
// =============================================================================

export interface EmptyStateProps {
  /** Icon component to display */
  icon?: React.ComponentType<{ className?: string }>;
  /** Main title text */
  title: string;
  /** Optional description message */
  message?: string;
  /** Optional action button or element */
  action?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Error Display Types
// =============================================================================

export interface ErrorDisplayUIComponents {
  /** Alert component */
  Alert: React.ComponentType<{
    variant?: "default" | "destructive";
    className?: string;
    children?: React.ReactNode;
  }>;
  /** Alert title component */
  AlertTitle: React.ComponentType<{
    children?: React.ReactNode;
  }>;
  /** Alert description component */
  AlertDescription: React.ComponentType<{
    className?: string;
    children?: React.ReactNode;
  }>;
  /** Button component */
  Button: React.ComponentType<{
    variant?: string;
    size?: string;
    className?: string;
    onClick?: () => void;
    children?: React.ReactNode;
  }>;
  /** Alert circle icon */
  AlertCircleIcon: React.ComponentType<{ className?: string }>;
}

export interface ErrorDisplayProps {
  /** Error title */
  title?: string;
  /** Error message to display */
  message: string;
  /** Optional retry callback */
  onRetry?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Circular Progress Types
// =============================================================================

export type CircularProgressColor =
  | "green"
  | "blue"
  | "purple"
  | "orange"
  | "pink"
  | "gray";

export interface CircularProgressProps {
  /** Progress value from 0-100 */
  value: number;
  /** Size of the circular progress in pixels */
  size?: number;
  /** Stroke width in pixels */
  strokeWidth?: number;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show the percentage value */
  showValue?: boolean;
  /** Color theme */
  color?: CircularProgressColor;
  /** Custom content to display in the center */
  children?: React.ReactNode;
}

export const CIRCULAR_PROGRESS_COLOR_VARIANTS = {
  green: {
    track: "stroke-green-200",
    progress: "stroke-green-600",
    text: "text-green-700",
  },
  blue: {
    track: "stroke-blue-200",
    progress: "stroke-blue-600",
    text: "text-blue-700",
  },
  purple: {
    track: "stroke-purple-200",
    progress: "stroke-purple-600",
    text: "text-purple-700",
  },
  orange: {
    track: "stroke-orange-200",
    progress: "stroke-orange-600",
    text: "text-orange-700",
  },
  pink: {
    track: "stroke-pink-200",
    progress: "stroke-pink-600",
    text: "text-pink-700",
  },
  gray: {
    track: "stroke-gray-200",
    progress: "stroke-gray-600",
    text: "text-gray-700",
  },
} as const;
