"use client";

import type {
    BreadcrumbsFactoryConfig,
    BreadcrumbsProps,
    BreadcrumbsUIComponents,
} from "./types";

/**
 * Factory function to create a Breadcrumbs component.
 *
 * This uses the factory pattern because it depends on UI components
 * (Button, Link) and a router hook that apps provide.
 *
 * @example
 * ```tsx
 * import { createBreadcrumbs } from '@jetdevs/core/ui/display';
 * import { Button } from '@/components/ui/button';
 * import Link from 'next/link';
 * import { ArrowLeft } from 'lucide-react';
 * import { useRouter } from 'next/navigation';
 *
 * export const Breadcrumbs = createBreadcrumbs(
 *   {
 *     Button,
 *     Link,
 *     ArrowLeftIcon: ArrowLeft,
 *   },
 *   {
 *     useRouter,
 *   }
 * );
 * ```
 */
export function createBreadcrumbs(
  ui: BreadcrumbsUIComponents,
  config: BreadcrumbsFactoryConfig
) {
  const { Button, Link, ArrowLeftIcon } = ui;
  const { useRouter } = config;

  function Breadcrumbs({
    items,
    title,
    badge,
    rightChildren,
    back,
  }: BreadcrumbsProps) {
    const router = useRouter();

    return (
      <div className="flex flex-col items-start p-4 gap-4 border-b bg-background md:p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-4">
          {items &&
            items.map((item, index) =>
              item.link ? (
                <Link
                  key={`breadcrumb-${index}`}
                  href={item.link}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              ) : (
                <div
                  key={`breadcrumb-${index}`}
                  className="flex items-center gap-2 text-foreground font-medium"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  <span>{item.label}</span>
                </div>
              )
            )}
          {back && (
            <Button
              variant="ghost"
              className="flex items-center gap-2"
              onClick={() => router.back()}
            >
              <ArrowLeftIcon className="h-4 w-4" /> Back
            </Button>
          )}
          {title && <h1 className="text-2xl font-semibold">{title}</h1>}
        </div>
        {badge}
        {rightChildren && (
          <div className="flex items-center gap-2 md:ml-auto">
            {rightChildren}
          </div>
        )}
      </div>
    );
  }

  Breadcrumbs.displayName = "Breadcrumbs";
  return Breadcrumbs;
}

/**
 * Simple Breadcrumbs component that doesn't require external UI components.
 * Use this when you don't have specific Button/Link components available.
 *
 * Note: This version uses basic HTML elements and doesn't support
 * the back button functionality (requires router).
 */
export function SimpleBreadcrumbs({
  items,
  title,
  badge,
  rightChildren,
}: Omit<BreadcrumbsProps, "back">) {
  return (
    <div className="flex flex-col items-start p-4 gap-4 border-b bg-background md:p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex gap-4 items-center">
        {items &&
          items.map((item, index) =>
            item.link ? (
              <a
                key={`breadcrumb-${index}`}
                href={item.link}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                <span>{item.label}</span>
              </a>
            ) : (
              <div
                key={`breadcrumb-${index}`}
                className="flex items-center gap-2 text-foreground font-medium"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                <span>{item.label}</span>
              </div>
            )
          )}
        {title && <h1 className="text-2xl font-semibold">{title}</h1>}
      </div>
      {badge}
      {rightChildren && (
        <div className="flex items-center gap-2 md:ml-auto">{rightChildren}</div>
      )}
    </div>
  );
}
