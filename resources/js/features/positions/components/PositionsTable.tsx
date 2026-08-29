import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ColumnDef } from '@tanstack/react-table';
import { BriefcaseBusiness, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { DataTable } from '@/Components/tables/DataTable';
import { cn } from '@/lib/utils';
import type { Position } from '@/types/position';

import { PositionStatusBadge } from './PositionStatusBadge';

interface PositionsTableProps {
    /** Positions to render (already fetched by the parent page). */
    positions: Position[];
    /** Shows skeleton rows while the parent query is loading. */
    isLoading?: boolean;
    /** Open the edit drawer for a position. */
    onEdit: (position: Position) => void;
    /** Permanently delete a position (parent handles the mutation + toast). */
    onDelete: (position: Position) => void;
}

/** AUD currency formatter used to render the hourly pay scale. */
const currencyFormatter = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/** Format a nullable hourly rate as an hourly pay label, e.g. `$28.50/hr`. */
function formatPayScale(rate: number | null): string {
    if (rate === null) {
        return '—';
    }

    return `${currencyFormatter.format(rate)}/hr`;
}

/**
 * Small colour-coded avatar for a position. The swatch colour is a user-defined
 * data value (hex from the API), so it is applied via inline style rather than a
 * Tailwind token; it falls back to a neutral accent chip.
 */
function PositionAvatar({ color }: { color: string | null }): JSX.Element {
    if (color) {
        return (
            <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${color}1a`, color }}
                aria-hidden="true"
            >
                <BriefcaseBusiness className="h-4 w-4" />
            </span>
        );
    }

    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
        </span>
    );
}

/**
 * Per-row action menu: edit and delete. Deleting is a destructive action so it
 * is gated behind a confirmation dialog (per UX rules). All effects are
 * delegated to the parent via callbacks, keeping this component presentational.
 */
function PositionActionsMenu({
    position,
    onEdit,
    onDelete,
}: {
    position: Position;
    onEdit: (position: Position) => void;
    onDelete: (position: Position) => void;
}): JSX.Element {
    const [confirmDelete, setConfirmDelete] = useState(false);

    const itemClasses =
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground';

    return (
        <>
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        aria-label={`Actions for ${position.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        align="end"
                        sideOffset={8}
                        className="z-50 min-w-48 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                    >
                        <DropdownMenu.Item
                            onSelect={() => onEdit(position)}
                            className={itemClasses}
                        >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit position
                        </DropdownMenu.Item>

                        <DropdownMenu.Separator className="my-1 h-px bg-border" />

                        <DropdownMenu.Item
                            onSelect={() => setConfirmDelete(true)}
                            className={cn(itemClasses, 'text-danger focus:bg-danger/10')}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete position
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Delete {position.name}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            This will permanently remove the position and cannot be undone.
                            Employees assigned to this position may need to be reassigned.
                        </AlertDialog.Description>
                        <div className="mt-6 flex justify-end gap-3">
                            <AlertDialog.Cancel asChild>
                                <button
                                    type="button"
                                    className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Cancel
                                </button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                                <button
                                    type="button"
                                    onClick={() => onDelete(position)}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Delete position
                                </button>
                            </AlertDialog.Action>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>
        </>
    );
}

/**
 * Positions data table. Pure presentational wrapper around the reusable
 * {@link DataTable}: it declares the columns (title + colour avatar, code,
 * pay scale, status pill and a per-row actions menu) and delegates all effects
 * to the parent through callbacks. Search, sorting, pagination and column
 * visibility are provided by {@link DataTable}.
 */
export function PositionsTable({
    positions,
    isLoading = false,
    onEdit,
    onDelete,
}: PositionsTableProps): JSX.Element {
    const columns: ColumnDef<Position>[] = [
        {
            id: 'name',
            accessorKey: 'name',
            header: 'Position',
            cell: ({ row }) => {
                const position = row.original;
                return (
                    <button
                        type="button"
                        onClick={() => onEdit(position)}
                        className="flex items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <PositionAvatar color={position.color} />
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                                {position.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground sm:hidden">
                                {formatPayScale(position.defaultHourlyRate)}
                            </p>
                        </div>
                    </button>
                );
            },
        },
        {
            id: 'department',
            accessorKey: 'departmentName',
            header: 'Department',
            cell: ({ row }) => {
                const departmentName = row.original.departmentName;
                return departmentName ? (
                    <span className="truncate text-sm text-foreground">{departmentName}</span>
                ) : (
                    <span className="text-sm text-muted-foreground">Company-wide</span>
                );
            },
        },
        {
            id: 'code',
            accessorKey: 'code',
            header: 'Code',

            cell: ({ row }) => {
                const code = row.original.code;
                return code ? (
                    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-secondary-foreground">
                        {code}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                );
            },
            meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' },
        },
        {
            id: 'description',
            accessorKey: 'description',
            header: 'Description',
            cell: ({ row }) => (
                <span className="block max-w-xs truncate text-muted-foreground">
                    {row.original.description ?? '—'}
                </span>
            ),
            meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
        },
        {
            id: 'payScale',
            accessorKey: 'defaultHourlyRate',
            header: 'Pay scale',
            cell: ({ row }) => (
                <span className="whitespace-nowrap font-medium text-foreground">
                    {formatPayScale(row.original.defaultHourlyRate)}
                </span>
            ),
            meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
        },
        {
            id: 'status',
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <PositionStatusBadge status={row.original.status} />,
        },
        {
            id: 'actions',
            header: '',
            enableHiding: false,
            cell: ({ row }) => (
                <div className="flex justify-end">
                    <PositionActionsMenu
                        position={row.original}
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                </div>
            ),
            meta: { headerClassName: 'w-12', cellClassName: 'w-12' },
        },
    ];

    return (
        <DataTable<Position, unknown>
            columns={columns}
            data={positions}
            searchKey="name"
            searchPlaceholder="Search positions..."
            isLoading={isLoading}
        />
    );
}
