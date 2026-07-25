"use client";

import * as React from "react";
import type {
  ImageUploadFactoryConfig,
  ImageUploadProps,
  ImageUploadUIComponents,
} from "./types";

/** Fallback class combiner when the app injects none. */
const joinClasses = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(" ");

/**
 * Factory function to create an ImageUpload drop zone.
 *
 * Consolidates the component that existed as NINE copies across the apps
 * (yobo, crm, cadra-web, cadra-web-qr, core-saas, yobo-auth, proto,
 * superhost-app, commerce-app) in three dialects that had already begun to
 * drift apart. The differences were: whether errors went to a `sonner` toast,
 * and a null-check style with no behavioural effect. Neither is a reason for
 * three implementations, and a tenth copy was about to be written.
 *
 * The toast is the reason this is a factory rather than a plain export: a
 * shared component cannot import the host app's notification library. Errors
 * surface through `onError`, so the three toasting apps pass `toast.error` and
 * behave exactly as before, while the rest render errors however they like.
 *
 * Deliberately transport-agnostic — it hands back a `File` and the caller
 * decides how the bytes travel. That is what lets the same component sit in
 * front of a presigned PUT, a multipart POST, or a tRPC mutation without
 * knowing which.
 *
 * @example
 * ```tsx
 * import { createImageUpload } from '@jetdevs/core/ui/forms';
 * import { Button } from '@/components/ui/button';
 * import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
 * import { cn } from '@/lib/utils';
 *
 * export const ImageUpload = createImageUpload(
 *   { Button, UploadIcon: Upload, XIcon: X, ImageIcon, LoaderIcon: Loader2 },
 *   { cn }
 * );
 * ```
 */
export function createImageUpload(
  ui: ImageUploadUIComponents,
  config: ImageUploadFactoryConfig = {}
) {
  const { Button, UploadIcon, XIcon, ImageIcon, LoaderIcon } = ui;
  const cn = config.cn ?? joinClasses;

  return function ImageUpload({
    onUpload,
    onClear,
    currentImageUrl,
    maxSizeMB = 10,
    acceptedFormats = ["image/jpeg", "image/png", "image/gif", "image/webp"],
    className,
    disabled = false,
    loading = false,
    maxHeightPx = 384, // 24rem
    minHeightPx = 256, // 16rem
    onError,
  }: ImageUploadProps) {
    const [isDragging, setIsDragging] = React.useState(false);
    const [preview, setPreview] = React.useState<string | null>(currentImageUrl || null);
    const [imgAspect, setImgAspect] = React.useState<number | null>(null); // width / height
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = React.useState<number>(0);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const validateFile = (file: File): boolean => {
      if (!acceptedFormats.includes(file.type)) {
        onError?.(`Invalid file type. Accepted formats: ${acceptedFormats.join(", ")}`);
        return false;
      }
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        onError?.(`File size must be less than ${maxSizeMB}MB`);
        return false;
      }
      return true;
    };

    const handleFile = React.useCallback(
      async (file: File) => {
        if (!validateFile(file)) return;

        // Local preview first, so the merchant sees their image immediately
        // rather than after the round trip.
        const reader = new FileReader();
        reader.onloadend = () => {
          const url = reader.result as string;
          setPreview(url);
          try {
            const img = new Image();
            img.onload = () => {
              if (img.naturalWidth && img.naturalHeight) {
                setImgAspect(img.naturalWidth / img.naturalHeight);
              }
            };
            img.src = url;
          } catch {
            // ignore ratio errors
          }
        };
        reader.readAsDataURL(file);

        try {
          await onUpload(file);
        } catch (error) {
          // Roll the preview back: leaving the optimistic image up after a
          // failed upload tells the user the opposite of what happened.
          setPreview(currentImageUrl || null);
          onError?.(error instanceof Error ? error.message : "Failed to upload image");
        }
      },
      [onUpload, currentImageUrl, maxSizeMB, acceptedFormats, onError]
    );

    // Observe container width for responsive height calc
    React.useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const update = () => setContainerWidth(el.clientWidth || 0);
      update();
      const ro = new ResizeObserver(() => update());
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // When external currentImageUrl changes, update preview and recompute aspect
    React.useEffect(() => {
      if (currentImageUrl) {
        setPreview(currentImageUrl);
        try {
          const img = new Image();
          img.onload = () => {
            if (img.naturalWidth && img.naturalHeight) {
              setImgAspect(img.naturalWidth / img.naturalHeight);
            }
          };
          img.src = currentImageUrl;
        } catch {
          // ignore ratio errors
        }
      } else {
        setPreview(null);
        setImgAspect(null);
      }
    }, [currentImageUrl]);

    // Compute display height and fit mode
    const computeDisplay = () => {
      if (!containerWidth || !imgAspect) {
        return { height: minHeightPx, crop: false } as const;
      }
      const naturalHeightAtFullWidth = containerWidth / imgAspect;
      if (naturalHeightAtFullWidth > maxHeightPx) {
        return { height: maxHeightPx, crop: true } as const; // crop overflow
      }
      if (naturalHeightAtFullWidth < minHeightPx) {
        return { height: minHeightPx, crop: false } as const;
      }
      return { height: naturalHeightAtFullWidth, crop: false } as const;
    };
    const { height: displayHeightPx, crop } = computeDisplay();

    const handleDragOver = React.useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    }, []);

    const handleDragLeave = React.useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    }, []);

    const handleDrop = React.useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (disabled || loading) return;

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0 && files[0]) {
          void handleFile(files[0]);
        }
      },
      [handleFile, disabled, loading]
    );

    const handleFileSelect = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0 && files[0]) {
          void handleFile(files[0]);
        }
      },
      [handleFile]
    );

    const handleClear = React.useCallback(() => {
      setPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onClear?.();
    }, [onClear]);

    const handleClick = React.useCallback(() => {
      if (!disabled && !loading) {
        fileInputRef.current?.click();
      }
    }, [disabled, loading]);

    return (
      <div className={cn("relative", className)}>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFormats.join(",")}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || loading}
        />

        {preview ? (
          <div
            ref={containerRef}
            className="relative rounded-lg border-2 border-border overflow-hidden"
            style={{ height: `${displayHeightPx}px` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Upload preview"
              className={cn("w-full h-full", crop ? "object-cover" : "object-contain")}
            />
            <div className="absolute top-2 right-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleClick}
                disabled={disabled || loading}
              >
                {loading ? (
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadIcon className="h-4 w-4" />
                )}
                Change
              </Button>
              {onClear && (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={handleClear}
                  disabled={disabled || loading}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            className={cn(
              "relative rounded-lg border-2 border-dashed transition-colors cursor-pointer",
              "flex flex-col items-center justify-center p-6",
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
              disabled || loading ? "opacity-50 cursor-not-allowed" : "hover:border-primary/50",
              className
            )}
            style={{ minHeight: `${minHeightPx}px` }}
          >
            {loading ? (
              <LoaderIcon className="h-10 w-10 animate-spin text-muted-foreground mb-2" />
            ) : (
              <ImageIcon className="h-10 w-10 text-muted-foreground mb-2" />
            )}

            <p className="text-sm font-medium text-center">
              {loading ? "Uploading..." : "Click to upload or drag and drop"}
            </p>
            <p className="text-xs text-muted-foreground text-center mt-1">
              {acceptedFormats.map((f) => f.replace("image/", "").toUpperCase()).join(", ")}
              {" • "}
              Max {maxSizeMB}MB
            </p>
          </div>
        )}
      </div>
    );
  };
}
