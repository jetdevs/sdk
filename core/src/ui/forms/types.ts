"use client";

import * as React from "react";

// =============================================================================
// Image Upload Types
// =============================================================================

/**
 * UI primitives the ImageUpload factory needs injected.
 *
 * Core ships no Shadcn primitives by design (`ui/primitives` is deliberately
 * empty) — the app owns its component library and hands the pieces in, exactly
 * as `createBaseListTable` and `createDataTableColumnHeader` do. Icons are
 * injected for the same reason: it keeps `lucide-react` out of the SDK's
 * dependency surface and lets an app swap its icon set without forking a
 * component.
 */
export interface ImageUploadUIComponents {
  /**
   * Button primitive (Shadcn-compatible).
   *
   * `variant` / `size` are the exact unions rather than `string`: a Shadcn
   * Button declares narrow unions, and a component accepting a narrow union is
   * NOT assignable to one accepting `string`. Same shape as
   * `ColumnHeaderUIComponents` for that reason.
   */
  Button: React.ComponentType<{
    type?: "button" | "submit" | "reset";
    size?: "default" | "sm" | "lg" | "icon";
    variant?: "default" | "outline" | "ghost" | "link" | "destructive" | "secondary";
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }>;
  /** Shown on the "Change" action. */
  UploadIcon: React.ComponentType<{ className?: string }>;
  /** Shown on the clear action. */
  XIcon: React.ComponentType<{ className?: string }>;
  /** Empty-state placeholder. */
  ImageIcon: React.ComponentType<{ className?: string }>;
  /** Spinner while `loading`. */
  LoaderIcon: React.ComponentType<{ className?: string }>;
}

export interface ImageUploadProps {
  /** Called with the accepted file. The caller owns transport (presigned PUT, POST, …). */
  onUpload: (file: File) => void | Promise<void>;
  /** Shown as a clear action when provided; omit for an upload-only drop zone. */
  onClear?: () => void;
  /** Existing image to preview. */
  currentImageUrl?: string | null;
  maxSizeMB?: number;
  acceptedFormats?: string[];
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  /** Maximum preview height in px before the image is cropped. */
  maxHeightPx?: number;
  /** Minimum preview / drop-zone height in px. */
  minHeightPx?: number;
  /**
   * Called when a file is rejected (wrong type, too large) or `onUpload`
   * throws.
   *
   * This exists instead of a toast dependency. Three apps' copies of this
   * component called `sonner`'s `toast.error` directly, which is precisely the
   * kind of thing that cannot move into a shared package — an SDK that picks
   * the host app's notification library is an SDK the host cannot adopt. Apps
   * that want toasts pass `toast.error` here; apps that render errors inline
   * pass their own setter. Silent rejection remains possible but is now a
   * choice rather than an accident.
   */
  onError?: (message: string) => void;
}

export interface ImageUploadFactoryConfig {
  /** Class-name combiner (`cn`). Defaults to a plain space join. */
  cn?: (...classes: (string | false | null | undefined)[]) => string;
}
