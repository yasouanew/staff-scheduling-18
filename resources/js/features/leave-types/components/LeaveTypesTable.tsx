import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { DataTable } from '@/Components/tables/DataTable';
import { cn } from '@/lib/utils';
import type { LeaveType } from '@/types/leave-type';

import { LeaveTypeStatusBadge } from './LeaveTypeStatusBadge';

interface LeaveTypesTableProps {
    leaveTypes: LeaveType[];
    isLoading?: boolean;
    onEdit: (leaveType: LeaveType) => void;
    onDelete: (leaveType: LeaveType) => void;
}

function formatDays(days: number | null): string {
    if (days === null) {
        return 'Not set';
    }

    return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Describes how unused leave may carry across the leave year. */
function RolloverRule({ leaveType }: { leaveType: LeaveType }): JSX.Element {
    if (!leaveType.allowsRollover) {
        return <span className="text-muted-foreground">Not permitted</span>;
    }

    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-foreground">
            <RotateCcw className="h-4 w-4 text-primary" aria-hidden="true" />
            Up to {formatDays(leaveType.maxRolloverDays)}
        </span>
    );
}

/** Per-row action menu with confirmed deletion, keeping table effects delegated upward. */
function LeaveTypeActions({
    leaveType,
    onEdit,
    onDelete,
}: {
    leaveType: LeaveType;
    onEdit: (leaveType: LeaveType) => void;
    onDelete: (leaveType: LeaveType) => void;
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
                        aria-label={`Actions for ${leaveType.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        align="end"
                        sideOffset={8}
                        className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                    >
                        <DropdownMenu.Item onSelect={() => onEdit(leaveType)} className={itemClasses}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit leave type
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="my-1 h-px bg-border" />
                        <DropdownMenu.Item
                            onSelect={() => setConfirmDelete(true)}
                            className={cn(itemClasses, 'text-danger focus:bg-danger/10')}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete leave type
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Delete {leaveType.name}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            This removes the leave type from future employee requests. Historical leave records may
                            need review before deleting a category.
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
                                    onClick={() => onDelete(leaveType)}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Delete leave type
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
 * Presentational leave type table. The generic table supplies search, sorting,
 * pagination and column visibility, while this component keeps leave policy
 * columns and user actions focused and reusable.
 */
export function LeaveTypesTable({
    leaveTypes,
    isLoading = false,
    onEdit,
    onDelete,
}: LeaveTypesTableProps): JSX.Element {
    const columns: ColumnDef<LeaveType>[] = [
        {
            id: 'name',
            accessorFn: (leaveType) =>
                [leaveType.name, leaveType.code, leaveType.description].filter(Boolean).join(' '),
            header: 'Leave type',
            cell: ({ row }) => {
                const leaveType = row.original;
                return (
                    <button
                        type="button"
                        onClick={() => onEdit(leaveType)}
                        className="min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <p className="truncate font-medium text-foreground">{leaveType.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                            {leaveType.code ?? leaveType.description ?? 'Employee request category'}
                        </p>
                    </button>
                );
            },
        },
        {
            id: 'allowance',
            accessorFn: (leaveType) => leaveType.allowanceDays ?? -1,
            header: 'Annual allowance',
            cell: ({ row }) => (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-foreground">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {formatDays(row.original.allowanceDays)}
                </span>
            ),
            meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' },
        },
        {
            id: 'payment',
            accessorFn: (leaveType) => (leaveType.isPaid ? 'Paid' : 'Unpaid'),
            header: 'Payment',
            cell: ({ row }) => (
                <span
                    className={cn(
                        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                        row.original.isPaid
                            ? 'bg-success/10 text-success'
                            : 'bg-secondary text-secondary-foreground',
                    )}
                >
                    {row.original.isPaid ? 'Paid' : 'Unpaid'}
                </span>
            ),
        },
        {
            id: 'rollover',
            accessorFn: (leaveType) =>
                leaveType.allowsRollover ? leaveType.maxRolloverDays ?? 0 : -1,
            header: 'Rollover',
            cell: ({ row }) => <RolloverRule leaveType={row.original} />,
            meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
        },
        {
            id: 'status',
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <LeaveTypeStatusBadge status={row.original.status} />,
            meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' },
        },
        {
            id: 'actions',
            header: '',
            enableHiding: false,
            cell: ({ row }) => (
                <div className="flex justify-end">
                    <LeaveTypeActions
                        leaveType={row.original}
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                </div>
            ),
            meta: { headerClassName: 'w-12', cellClassName: 'w-12' },
        },
    ];

    return (
        <DataTable<LeaveType, unknown>
            columns={columns}
            data={leaveTypes}
            isLoading={isLoading}
            searchKey="name"
            searchPlaceholder="Search leave types..."
        />
    );
}
