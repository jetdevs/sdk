/**
 * Shared test fixtures for the data-table DOM render tests.
 *
 * Minimal, dependency-free stub UI primitives (plain HTML elements) injected into
 * the SDK factories so the tests assert the factory's OWN render logic, not any
 * app's Shadcn styling. These mirror the structural `DataTableUIComponents` /
 * `DataTableWithToolbarUIComponents` interfaces.
 */
import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';

export interface Person {
  id: string;
  name: string;
  email: string;
}

export const PEOPLE: Person[] = [
  { id: 'u1', name: 'Alice', email: 'alice@example.com' },
  { id: 'u2', name: 'Bob', email: 'bob@example.com' },
  { id: 'u3', name: 'Carol', email: 'carol@example.com' },
];

export const personColumns: ColumnDef<Person, unknown>[] = [
  { accessorKey: 'name', header: 'Name', cell: (c) => c.getValue() as string },
  { accessorKey: 'email', header: 'Email', cell: (c) => c.getValue() as string },
];

// ---------------------------------------------------------------------------
// Stub UI primitives — plain HTML, no styling deps.
// ---------------------------------------------------------------------------

const Table = (p: React.HTMLAttributes<HTMLTableElement>) => <table {...p} />;
const TableHeader = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...p} />;
const TableBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} />;
const TableRow = (p: React.HTMLAttributes<HTMLTableRowElement> & { 'data-state'?: string }) => <tr {...p} />;
const TableHead = (p: React.ThHTMLAttributes<HTMLTableCellElement>) => <th {...p} />;
const TableCell = (p: React.TdHTMLAttributes<HTMLTableCellElement>) => <td {...p} />;

const Button = ({
  children,
  onClick,
  disabled,
  className,
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: string;
  size?: string;
  asChild?: boolean;
}) => (
  <button type="button" onClick={onClick} disabled={disabled} className={className}>
    {children}
  </button>
);

const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} />;
const Badge = ({ children, className }: { children?: React.ReactNode; className?: string; variant?: string }) => (
  <span className={className}>{children}</span>
);

// Dropdown / Select stubs — render children inertly (enough for the render path).
const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
const Select = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
const SelectTrigger = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
const SelectValue = ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>;
const SelectContent = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
const SelectItem = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
const DropdownMenu = Passthrough;
const DropdownMenuTrigger = Passthrough;
const DropdownMenuContent = Passthrough;
const DropdownMenuLabel = Passthrough;
const DropdownMenuSeparator = () => <hr />;
const DropdownMenuItem = ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
  <div onClick={onClick}>{children}</div>
);
const DropdownMenuCheckboxItem = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;

const Icon = ({ className }: { className?: string }) => <svg className={className} />;

/** UI bag for `createDataTableWithToolbar`. */
export const toolbarUi = {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Input,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  toast: { success: () => {}, error: () => {} },
} as const;

/** UI bag for `createBaseListTable`. */
export const baseUi = {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  SearchIcon: Icon,
  RefreshIcon: Icon,
  ClearIcon: Icon,
  ColumnsIcon: Icon,
  ChevronLeftIcon: Icon,
  ChevronRightIcon: Icon,
  ChevronsLeftIcon: Icon,
  ChevronsRightIcon: Icon,
} as const;
