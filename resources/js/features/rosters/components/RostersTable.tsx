import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ColumnDef } from '@tanstack/react-table';
import {
    CalendarRange,
    Eye,
    MoreHorizontal,
    Pencil,
    Send,
    Trash2,
} from 'lucide-react';
import { useState } from 'react';

import { DataTable } from '@/Components/tables/DataTable';
import { cn } from '@/lib/utils';
import type { Roster } from '@/types/roster-management';

import { describeWeekOffset, formatWeekRange } from '../lib/roster-week';
import { RosterStatusBadge } from './RosterStatusBadge';

interface RostersTableProps {
    /** Rosters to render (already fetched by the parent page). */
    rosters: Roster[];
    /** Shows skeleton rows while the parent query is loading. */
    isLoading?: boolean;
    /** Navigate to the roster week view. */
    onView: (roster: Roster) => void;
    /** Open the edit drawer for a roster. */
    onEdit: (roster: Roster) => void;
    /** Publish the roster (parent handles the mutation + toast). */
    onPublish: (roster: Roster) => void;
    /** Permanently delete the roster (parent handles the mutation + toast). */
    onDelete: (roster: Roster) => void;
}

/** Muted placeholder used for empty relation cells. */
function EmptyCell(): JSX.Element {
    return <span className="text-muted-foreground">—</span>;
}

/**
 * Per-row action menu: view, edit, publish and delete. Both destructive and
 * irreversible actions (delete, publish) are gated behind confirmation dialogs
 * per the UX rules; all effects are delegated to the parent via callbacks.
 */
function RosterActionsMenu({
    roster,
    onView,
    onEdit,
    onPublish,
    onDelete,
}: {
    roster: Roster;
    onView: (roster: Roster) => void;
    onEdit: (roster: Roster) => void;
    onPublish: (roster: Roster) => void;
    onDelete: (roster: Roster) => void;
}): JSX.Element {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmPublish, setConfirmPublish] = useState(false);

    const weekLabel = formatWeekRange(roster.weekStart, roster.weekEnd);
    const canPublish = roster.status === 'draft';

    const itemClasses =
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground';

    const cancelClasses =
        'inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

    return (
        <>
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        aria-label={`Actions for the week of ${weekLabel}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        align="end"
                        sideOffset={8}
                        className="z-50 min-w-52 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                    >
                        <DropdownMenu.Item onSelect={() => onView(roster)} className={itemClasses}>
                            <Eye className="h-4 w-4" aria-hidden="true" />
                            View week
                        </DropdownMenu.Item>

                        <DropdownMenu.Item onSelect={() => onEdit(roster)} className={itemClasses}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit roster
                        </DropdownMenu.Item>

                        {canPublish ? (
                            <DropdownMenu.Item
                                onSelect={() => setConfirmPublish(true)}
                                className={cn(itemClasses, 'text-success focus:bg-success/10')}
                            >
                                <Send className="h-4 w-4" aria-hidden="true" />
                                Publish roster
                            </DropdownMenu.Item>
                        ) : null}

                        <DropdownMenu.Separator className="my-1 h-px bg-border" />

                        <DropdownMenu.Item
                            onSelect={() => setConfirmDelete(true)}
                            className={cn(itemClasses, 'text-danger focus:bg-danger/10')}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete roster
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>

            {/* Publish confirmation — publishing notifies employees. */}
            <AlertDialog.Root open={confirmPublish} onOpenChange={setConfirmPublish}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Publish {weekLabel}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            Publishing makes this roster visible to employees and notifies everyone
                            with an assigned shift.
                        </AlertDialog.Description>
                        <div className="mt-6 flex justify-end gap-3">
                            <AlertDialog.Cancel asChild>
                                <button type="button" className={cancelClasses}>
                                    Cancel
                                </button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                                <button
                                    type="button"
                                    onClick={() => onPublish(roster)}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Publish roster
                                </button>
                            </AlertDialog.Action>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>

            {/* Delete confirmation — destructive and irreversible. */}
            <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Delete the week of {weekLabel}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            This permanently removes the roster and every shift inside it. This
                            action cannot be undone.
                        </AlertDialog.Description>
                        <div className="mt-6 flex justify-end gap-3">
                            <AlertDialog.Cancel asChild>
                                <button type="button" className={cancelClasses}>
                                    Cancel
                                </button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                                <button
                                    type="button"
                                    onClick={() => onDelete(roster)}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Delete roster
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
 * Rosters data table. Presentational wrapper around the reusable
 * {@link DataTable}: it declares the columns (week range, branch scope, shift
 * count, status, publication details and a per-row action menu) and delegates
 * every effect to the parent. Search, sorting, pagination and column visibility
 * come from {@link DataTable}; low-priority columns collapse on smaller
 * viewports to keep the table readable on mobile.
 */
export function RostersTable({
    rosters,
    isLoading = false,
    onView,
    onEdit,
    onPublish,
    onDelete,
}: RostersTableProps): JSX.Element {
    const columns: ColumnDef<Roster>[] = [
        {
            id: 'week',
            accessorFn: (roster) => roster.weekStart ?? '',
            header: 'Week',
            cell: ({ row }) => {
                const roster = row.original;
                return (
                    <button
                        type="button"
                        onClick={() => onView(roster)}
                        className="flex items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                            aria-hidden="true"
                        >
                            <CalendarRange className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                                {formatWeekRange(roster.weekStart, roster.weekEnd)}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                                {describeWeekOffset(roster.weekStart)}
                            </p>
                        </div>
                    </button>
                );
            },
        },
        {
            id: 'branch',
            accessorKey: 'branchName',
            header: 'Branch',
            cell: ({ row }) =>
                row.original.branchName ? (
                    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {row.original.branchName}
                    </span>
                ) : (
                    <span className="text-muted-foreground">All branches</span>
                ),
            meta: {
                headerClassName: 'hidden md:table-cell',
                cellClassName: 'hidden md:table-cell',
            },
        },
        {
            id: 'shifts',
            accessorFn: (roster) => roster.shiftsCount ?? 0,
            header: 'Shifts',
            cell: ({ row }) => (
                <span className="whitespace-nowrap font-medium text-foreground">
                    {row.original.shiftsCount ?? 0}
                </span>
            ),
            meta: {
                headerClassName: 'hidden sm:table-cell',
                cellClassName: 'hidden sm:table-cell',
            },
        },
        {
            id: 'status',
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <RosterStatusBadge status={row.original.status} />,
        },
        {
            id: 'published',
            accessorKey: 'publishedByName',
            header: 'Published by',
            cell: ({ row }) =>
                row.original.publishedByName ? (
                    <span className="truncate text-sm text-foreground">
                        {row.original.publishedByName}
                    </span>
                ) : (
                    <EmptyCell />
                ),
            meta: {
                headerClassName: 'hidden xl:table-cell',
                cellClassName: 'hidden xl:table-cell',
            },
        },
        {
            id: 'actions',
            header: '',
            enableHiding: false,
            cell: ({ row }) => (
                <div className="flex justify-end">
                    <RosterActionsMenu
                        roster={row.original}
                        onView={onView}
                        onEdit={onEdit}
                        onPublish={onPublish}
                        onDelete={onDelete}
                    />
                </div>
            ),
            meta: { headerClassName: 'w-12', cellClassName: 'w-12' },
        },
    ];

    return (
        <DataTable<Roster, unknown>
            columns={columns}
            data={rosters}
            searchKey="week"
            searchPlaceholder="Search weeks..."
            isLoading={isLoading}
        />
    );
}
