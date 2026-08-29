import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
    type ColumnDef,
    type ColumnFiltersState,
    type RowData,
    type SortingState,
    type VisibilityState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';

// Allow columns to opt into responsive/utility classes on their header & cells.
declare module '@tanstack/react-table' {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface ColumnMeta<TData extends RowData, TValue> {
        headerClassName?: string;
        cellClassName?: string;
    }
}

import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Inbox,
    Search,
    SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

interface DataTableProps<TData, TValue> {
    /** Column definitions describing how each field renders. */
    columns: ColumnDef<TData, TValue>[];
    /** Row data to display. */
    data: TData[];
    /** Optional column id to enable real-time text filtering. */
    searchKey?: string;
    /** Placeholder text for the search input. */
    searchPlaceholder?: string;
    /** Renders skeleton rows while data is being fetched. */
    isLoading?: boolean;
}

/** Number of placeholder rows shown during the loading state. */
const SKELETON_ROW_COUNT = 5;

/**
 * Enterprise-grade, reusable data table wrapper built on TanStack Table.
 *
 * Provides search, sorting, pagination, column-visibility toggling and
 * dedicated loading / empty / default rendering states. Purely
 * presentational: it holds no data-fetching logic.
 */
export function DataTable<TData, TValue>({
    columns,
    data,
    searchKey,
    searchPlaceholder = 'Search...',
    isLoading = false,
}: DataTableProps<TData, TValue>): JSX.Element {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

    const table = useReactTable<TData>({
        data,
        columns,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
        },
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    const searchColumn = searchKey ? table.getColumn(searchKey) : undefined;
    const searchValue = (searchColumn?.getFilterValue() as string | undefined) ?? '';
    const visibleColumnCount = table.getVisibleLeafColumns().length || columns.length;
    const pageCount = table.getPageCount();
    const currentPage = table.getState().pagination.pageIndex + 1;

    return (
        <div className="space-y-4">
            {/* Toolbar: search (left) + column visibility (right). */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {searchColumn ? (
                    <div className="relative w-full sm:max-w-xs">
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            type="text"
                            value={searchValue}
                            onChange={(event) => searchColumn.setFilterValue(event.target.value)}
                            placeholder={searchPlaceholder}
                            aria-label={searchPlaceholder}
                            className={cn(
                                'h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm text-foreground',
                                'placeholder:text-muted-foreground',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            )}
                        />
                    </div>
                ) : (
                    <span />
                )}

                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            type="button"
                            className={cn(
                                'inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors',
                                'hover:bg-secondary hover:text-secondary-foreground',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            )}
                        >
                            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                            View
                            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                        <DropdownMenu.Content
                            align="end"
                            sideOffset={8}
                            className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                        >
                            <DropdownMenu.Label className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                Toggle columns
                            </DropdownMenu.Label>
                            <DropdownMenu.Separator className="my-1 h-px bg-border" />
                            {table
                                .getAllColumns()
                                .filter((column) => column.getCanHide())
                                .map((column) => (
                                    <DropdownMenu.CheckboxItem
                                        key={column.id}
                                        checked={column.getIsVisible()}
                                        onCheckedChange={(value) =>
                                            column.toggleVisibility(Boolean(value))
                                        }
                                        onSelect={(event) => event.preventDefault()}
                                        className={cn(
                                            'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm capitalize outline-none transition-colors',
                                            'focus:bg-accent focus:text-accent-foreground',
                                            'data-[state=checked]:font-medium',
                                        )}
                                    >
                                        <span className="flex h-4 w-4 items-center justify-center rounded border border-input">
                                            <DropdownMenu.ItemIndicator>
                                                <span className="h-2 w-2 rounded-sm bg-primary" />
                                            </DropdownMenu.ItemIndicator>
                                        </span>
                                        {column.id}
                                    </DropdownMenu.CheckboxItem>
                                ))}
                        </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                </DropdownMenu.Root>
            </div>

            {/* Table shell. */}
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full caption-bottom text-sm">
                        <thead className="border-b border-border bg-muted/40">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            scope="col"
                                            className={cn(
                                                'h-12 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                                                header.column.columnDef.meta?.headerClassName,
                                            )}
                                        >

                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext(),
                                                )}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: SKELETON_ROW_COUNT }).map((_, rowIndex) => (
                                    <tr
                                        key={`skeleton-${rowIndex}`}
                                        className="border-b border-border last:border-0"
                                    >
                                        {table.getVisibleLeafColumns().map((column) => (
                                            <td key={column.id} className="px-4 py-3">
                                                <div className="h-4 w-full max-w-[160px] animate-pulse rounded bg-muted" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : table.getRowModel().rows.length > 0 ? (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        data-state={row.getIsSelected() ? 'selected' : undefined}
                                        className="border-b border-border transition-colors last:border-0 hover:bg-muted/50 data-[state=selected]:bg-accent"
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td
                                                key={cell.id}
                                                className={cn(
                                                    'px-4 py-3 align-middle text-foreground',
                                                    cell.column.columnDef.meta?.cellClassName,
                                                )}
                                            >

                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext(),
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={visibleColumnCount} className="h-64">
                                        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
                                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                                <Inbox className="h-6 w-6" aria-hidden="true" />
                                            </span>
                                            <p className="text-sm font-semibold text-foreground">
                                                No results found
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                Try adjusting your search or filters.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination controls (bottom right). */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                    Page {pageCount === 0 ? 0 : currentPage} of {pageCount}
                </p>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        className={cn(
                            'inline-flex h-9 items-center gap-1 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors',
                            'hover:bg-secondary hover:text-secondary-foreground',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            'disabled:pointer-events-none disabled:opacity-50',
                        )}
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        Previous
                    </button>
                    <button
                        type="button"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        className={cn(
                            'inline-flex h-9 items-center gap-1 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors',
                            'hover:bg-secondary hover:text-secondary-foreground',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            'disabled:pointer-events-none disabled:opacity-50',
                        )}
                    >
                        Next
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    );
}
