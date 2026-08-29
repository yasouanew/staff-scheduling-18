import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays, MoreHorizontal, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';

import { DataTable } from '@/Components/tables/DataTable';
import { cn } from '@/lib/utils';
import type { Shift } from '@/types/shift';

import { formatShiftDate, formatShiftDuration, formatShiftTimeRange } from '../lib/shift-utils';
import { ShiftStatusBadge } from './ShiftStatusBadge';

interface ShiftsTableProps {
    shifts: Shift[];
    isLoading?: boolean;
    onEdit: (shift: Shift) => void;
    onAssign: (shift: Shift) => void;
    onDelete: (shift: Shift) => void;
}

/** Displays either an employee avatar or a clear unassigned state. */
function EmployeeCell({ shift }: { shift: Shift }): JSX.Element {
    const employee = shift.employee;

    if (!employee) {
        return (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10 text-warning">
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>Unassigned</span>
            </span>
        );
    }

    const initials = employee.name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.slice(0, 1).toUpperCase())
        .join('');

    return (
        <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {employee.avatarUrl ? (
                    <img src={employee.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                    initials
                )}
            </span>
            <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{employee.name}</p>
                <p className="truncate text-xs text-muted-foreground sm:hidden">
                    {shift.position?.name ?? 'No position'}
                </p>
            </div>
        </div>
    );
}

/** Row action menu; destructive removal is explicitly confirmed before delegation. */
function ShiftActions({
    shift,
    onEdit,
    onAssign,
    onDelete,
}: {
    shift: Shift;
    onEdit: (shift: Shift) => void;
    onAssign: (shift: Shift) => void;
    onDelete: (shift: Shift) => void;
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
                        aria-label={`Actions for shift on ${formatShiftDate(shift.date)}`}
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
                        <DropdownMenu.Item onSelect={() => onEdit(shift)} className={itemClasses}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit shift
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => onAssign(shift)} className={itemClasses}>
                            <UserPlus className="h-4 w-4" aria-hidden="true" />
                            {shift.employeeId ? 'Reassign employee' : 'Assign employee'}
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="my-1 h-px bg-border" />
                        <DropdownMenu.Item
                            onSelect={() => setConfirmDelete(true)}
                            className={cn(itemClasses, 'text-danger focus:bg-danger/10')}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete shift
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Delete this shift?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            The shift on {formatShiftDate(shift.date)} from{' '}
                            {formatShiftTimeRange(shift.startTime, shift.endTime)} will be permanently removed.
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
                                    onClick={() => onDelete(shift)}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Delete shift
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
 * Presentational shift data table. The shared table provides search, sorting,
 * pagination and column visibility; this component only defines shift-specific
 * columns and delegates every mutation to the parent page.
 */
export function ShiftsTable({
    shifts,
    isLoading = false,
    onEdit,
    onAssign,
    onDelete,
}: ShiftsTableProps): JSX.Element {
    const columns: ColumnDef<Shift>[] = [
        {
            id: 'employee',
            accessorFn: (shift) =>
                [shift.employee?.name, shift.position?.name, shift.branch?.name]
                    .filter(Boolean)
                    .join(' '),
            header: 'Employee',
            cell: ({ row }) => <EmployeeCell shift={row.original} />,
        },
        {
            id: 'date',
            accessorKey: 'date',
            header: 'Date',
            cell: ({ row }) => (
                <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-foreground">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {formatShiftDate(row.original.date)}
                </span>
            ),
        },
        {
            id: 'time',
            accessorFn: (shift) => `${shift.startTime}-${shift.endTime}`,
            header: 'Time',
            cell: ({ row }) => (
                <div className="whitespace-nowrap">
                    <p className="font-medium text-foreground">
                        {formatShiftTimeRange(row.original.startTime, row.original.endTime)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {formatShiftDuration(row.original.startTime, row.original.endTime)}
                    </p>
                </div>
            ),
        },
        {
            id: 'position',
            accessorFn: (shift) => shift.position?.name ?? '',
            header: 'Position',
            cell: ({ row }) => (
                <span className="text-muted-foreground">{row.original.position?.name ?? 'Unspecified'}</span>
            ),
            meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
        },
        {
            id: 'staffing',
            accessorFn: (shift) => `${shift.employeeId ? 1 : 0}/${shift.requiredStaff}`,
            header: 'Staffing',
            cell: ({ row }) => {
                const assigned = row.original.employeeId ? 1 : 0;
                return (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        {assigned}/{row.original.requiredStaff}
                    </span>
                );
            },
            meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
        },
        {
            id: 'status',
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <ShiftStatusBadge status={row.original.status} />,
            meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' },
        },
        {
            id: 'actions',
            header: '',
            enableHiding: false,
            cell: ({ row }) => (
                <div className="flex justify-end">
                    <ShiftActions
                        shift={row.original}
                        onEdit={onEdit}
                        onAssign={onAssign}
                        onDelete={onDelete}
                    />
                </div>
            ),
            meta: { headerClassName: 'w-12', cellClassName: 'w-12' },
        },
    ];

    return (
        <DataTable<Shift, unknown>
            columns={columns}
            data={shifts}
            isLoading={isLoading}
            searchKey="employee"
            searchPlaceholder="Search employee, position or branch..."
        />
    );
}
