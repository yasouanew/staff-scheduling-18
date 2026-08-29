import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Network, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { DataTable } from '@/Components/tables/DataTable';
import { cn } from '@/lib/utils';
import type { Department } from '@/types/department';

import { DepartmentStatusBadge } from './DepartmentStatusBadge';

interface DepartmentsTableProps {
    /** Departments to render (already fetched by the parent page). */
    departments: Department[];
    /** Shows skeleton rows while the parent query is loading. */
    isLoading?: boolean;
    /** Open the edit drawer for a department. */
    onEdit: (department: Department) => void;
    /** Permanently delete a department (parent handles the mutation + toast). */
    onDelete: (department: Department) => void;
}

/**
 * Small colour-coded avatar for a department. The swatch colour is a
 * user-defined data value (hex from the API), so it is applied via inline
 * style rather than a Tailwind token; it falls back to a neutral accent chip.
 */
function DepartmentAvatar({ color }: { color: string | null }): JSX.Element {
    if (color) {
        return (
            <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${color}1a`, color }}
                aria-hidden="true"
            >
                <Network className="h-4 w-4" />
            </span>
        );
    }

    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Network className="h-4 w-4" aria-hidden="true" />
        </span>
    );
}

/**
 * Per-row action menu: edit and delete. Deleting is a destructive action so it
 * is gated behind a confirmation dialog (per UX rules). All effects are
 * delegated to the parent via callbacks, keeping this component presentational.
 */
function DepartmentActionsMenu({
    department,
    onEdit,
    onDelete,
}: {
    department: Department;
    onEdit: (department: Department) => void;
    onDelete: (department: Department) => void;
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
                        aria-label={`Actions for ${department.name}`}
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
                            onSelect={() => onEdit(department)}
                            className={itemClasses}
                        >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit department
                        </DropdownMenu.Item>

                        <DropdownMenu.Separator className="my-1 h-px bg-border" />

                        <DropdownMenu.Item
                            onSelect={() => setConfirmDelete(true)}
                            className={cn(itemClasses, 'text-danger focus:bg-danger/10')}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete department
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Delete {department.name}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            This will permanently remove the department and cannot be undone.
                            Positions and employees linked to this department may be affected.
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
                                    onClick={() => onDelete(department)}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Delete department
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
 * Departments data table. Pure presentational wrapper around the reusable
 * {@link DataTable}: it declares the columns (name + colour avatar, code,
 * description, positions count, status pill and a per-row actions menu) and
 * delegates all effects to the parent through callbacks. Search, sorting,
 * pagination and column visibility are provided by {@link DataTable}.
 */
export function DepartmentsTable({
    departments,
    isLoading = false,
    onEdit,
    onDelete,
}: DepartmentsTableProps): JSX.Element {
    const columns: ColumnDef<Department>[] = [
        {
            id: 'name',
            accessorKey: 'name',
            header: 'Department',
            cell: ({ row }) => {
                const department = row.original;
                return (
                    <button
                        type="button"
                        onClick={() => onEdit(department)}
                        className="flex items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <DepartmentAvatar color={department.color} />
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                                {department.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground sm:hidden">
                                {department.code ?? department.description ?? 'No description'}
                            </p>
                        </div>
                    </button>
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
            meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
        },
        {
            id: 'positions',
            accessorKey: 'positionsCount',
            header: 'Positions',
            cell: ({ row }) => {
                const count = row.original.positionsCount;
                return (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {count ?? 0} {count === 1 ? 'position' : 'positions'}
                    </span>
                );
            },
            meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
        },
        {
            id: 'status',
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <DepartmentStatusBadge status={row.original.status} />,
        },
        {
            id: 'actions',
            header: '',
            enableHiding: false,
            cell: ({ row }) => (
                <div className="flex justify-end">
                    <DepartmentActionsMenu
                        department={row.original}
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                </div>
            ),
            meta: { headerClassName: 'w-12', cellClassName: 'w-12' },
        },
    ];

    return (
        <DataTable<Department, unknown>
            columns={columns}
            data={departments}
            searchKey="name"
            searchPlaceholder="Search departments..."
            isLoading={isLoading}
        />
    );
}
