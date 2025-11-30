/**
 * Table Export Hook
 *
 * Provides CSV and JSON export functionality for table data.
 */

'use client';

import { useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface UseTableExportProps<T> {
  /** Data to export */
  data: T[];
  /** Columns to include in export */
  columns: Array<keyof T>;
  /** Filename for download (without extension) */
  filename?: string;
  /** Function to get column header text */
  getColumnHeader?: (column: keyof T) => string;
  /** Function to get cell value as string */
  getColumnValue?: (item: T, column: keyof T) => string;
}

export interface UseTableExportReturn {
  /** Export data to CSV file */
  exportToCSV: () => void;
  /** Export data to JSON file */
  exportToJSON: () => void;
  /** Get CSV content as string */
  getCSVContent: () => string;
  /** Get JSON content as string */
  getJSONContent: () => string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function escapeCSVValue(value: string): string {
  // If value contains comma, newline, or quote, wrap in quotes and escape existing quotes
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  if (typeof document === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for exporting table data to CSV or JSON
 *
 * @example
 * const exporter = useTableExport({
 *   data: users,
 *   columns: ['name', 'email', 'role'],
 *   filename: 'users-export',
 *   getColumnHeader: (col) => columnLabels[col],
 *   getColumnValue: (item, col) => formatValue(item[col]),
 * });
 *
 * // Export buttons
 * <Button onClick={exporter.exportToCSV}>Export CSV</Button>
 * <Button onClick={exporter.exportToJSON}>Export JSON</Button>
 */
export function useTableExport<T>({
  data,
  columns,
  filename = 'export',
  getColumnHeader = (column) => String(column),
  getColumnValue = (item, column) => {
    const value = item[column];
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  },
}: UseTableExportProps<T>): UseTableExportReturn {
  const getCSVContent = useCallback((): string => {
    const headers = columns.map(getColumnHeader).map(escapeCSVValue);
    const rows = data.map((item) =>
      columns.map((column) => escapeCSVValue(getColumnValue(item, column)))
    );

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }, [data, columns, getColumnHeader, getColumnValue]);

  const getJSONContent = useCallback((): string => {
    const jsonContent = data.map((item) =>
      columns.reduce(
        (acc, column) => {
          acc[String(column)] = item[column];
          return acc;
        },
        {} as Record<string, unknown>
      )
    );

    return JSON.stringify(jsonContent, null, 2);
  }, [data, columns]);

  const exportToCSV = useCallback(() => {
    const content = getCSVContent();
    downloadFile(content, `${filename}.csv`, 'text/csv;charset=utf-8;');
  }, [getCSVContent, filename]);

  const exportToJSON = useCallback(() => {
    const content = getJSONContent();
    downloadFile(content, `${filename}.json`, 'application/json');
  }, [getJSONContent, filename]);

  return {
    exportToCSV,
    exportToJSON,
    getCSVContent,
    getJSONContent,
  };
}
