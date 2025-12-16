/**
 * UI Primitives Module
 *
 * DEPRECATED: Shadcn primitives have been removed from core.
 * Apps should install and configure Shadcn UI primitives directly.
 *
 * The core package now provides factory functions for framework components
 * (data-table, layout) that accept UI primitives as dependencies.
 *
 * Example usage in apps:
 * ```typescript
 * import { createBaseListTable } from '@jetdevs/core/ui/data-table';
 * import { Table, Button, Input, ... } from '@/components/ui';
 *
 * const BaseListTable = createBaseListTable({
 *   Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
 *   Button, Input, DropdownMenu, ...
 * });
 * ```
 */

// This module is intentionally empty.
// Primitives should be provided by the consuming application.
export { };

