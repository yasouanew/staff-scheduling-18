import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarPlus, Clock4, Copy, MoonStar, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { DataTable } from '@/Components/tables/DataTable';
import { cn } from '@/lib/utils';
import type { ShiftTemplate } from '@/types/shift-template';

import {
    computePaidMinutes,
    computeSpanMinutes,
    describeBreak,
    formatDuration,
    formatPaidHours,
    formatTimeRange,
    isOvernight,
} from '../lib/shift-time';
import { ShiftTemplateStatusBadge } from './ShiftTemplateStatusBadge';

interface ShiftTemplatesTableProps {
    /** Templates to render (already fetched by the parent page). */
    templates: ShiftTemplate[];
    /** Shows skeleton rows while the parent query is loading. */
    isLoading?: boolean;
    /** Open the edit drawer for a template. */
    onEdit: (template: ShiftTemplate) => void;
    /** Pre-fill a new template from an existing one. */
    onDuplicate: (template: ShiftTemplate) => void;
    /** Create a real shift from the template. */
    onUse: (template: ShiftTemplate) => void;
    /** Permanently delete a template (parent handles the mutation + toast). */
    onDelete: (template: ShiftTemplate) => void;
    /**
     * When false (schedulers lack `shift_template.delete`), the destructive
     * delete action is hidden — the backend would otherwise 403 it.
     */
    canDelete?: boolean;
}

/**
 * Small colour-coded avatar for a template. The swatch colour is a user-defined
 * data value (hex from the API), so it is applied via inline style rather than a
 * Tailwind token; it falls back to a neutral accent chip.
 */
function TemplateAvatar({ color }: { color: string | null }): JSX.Element {
    if (color) {
        return (
            <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${color}1a`, color }}
                aria-hidden="true"
            >
                <Clock4 className="h-4 w-4" />
            </span>
        );
    }

    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Clock4 className="h-4 w-4" aria-hidden="true" />
        </span>
    );
}

/** Muted text used for empty relation cells. */
function EmptyCell(): JSX.Element {
    return <span className="text-muted-foreground">—</span>;
}

/**
 * Per-row action menu: edit, use, duplicate and delete. Deleting is a
 * destructive action so it is gated behind a confirmation dialog (per UX
 * rules). All effects are delegated to the parent via callbacks, keeping this
 * component presentational.
 */
function TemplateActionsMenu({
    template,
    onEdit,
    onDuplicate,
    onUse,
    onDelete,
    canDelete,
}: {
    template: ShiftTemplate;
    onEdit: (template: ShiftTemplate) => void;
    onDuplicate: (template: ShiftTemplate) => void;
    onUse: (template: ShiftTemplate) => void;
    onDelete: (template: ShiftTemplate) => void;
    canDelete: boolean;
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
                        aria-label={`Actions for ${template.name}`}
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
                        <DropdownMenu.Item onSelect={() => onUse(template)} className={itemClasses}>
                            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                            Create shift from template
                        </DropdownMenu.Item>

                        <DropdownMenu.Item onSelect={() => onEdit(template)} className={itemClasses}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit template
                        </DropdownMenu.Item>

                        <DropdownMenu.Item
                            onSelect={() => onDuplicate(template)}
                            className={itemClasses}
                        >
                            <Copy className="h-4 w-4" aria-hidden="true" />
                            Duplicate template
                        </DropdownMenu.Item>

                        {canDelete ? (
                            <>
                                <DropdownMenu.Separator className="my-1 h-px bg-border" />

                                <DropdownMenu.Item
                                    onSelect={() => setConfirmDelete(true)}
                                    className={cn(itemClasses, 'text-danger focus:bg-danger/10')}
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    Delete template
                                </DropdownMenu.Item>
                            </>
                        ) : null}
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Delete {template.name}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            This will permanently remove the template and cannot be undone. Shifts
                            already created from it are not affected.
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
                                    onClick={() => onDelete(template)}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Delete template
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
 * Shift templates data table. Pure presentational wrapper around the reusable
 * {@link DataTable}: it declares the columns (name + colour avatar, time range,
 * duration, break, payable hours, scope and a per-row actions menu) and
 * delegates all effects to the parent through callbacks. Search, sorting,
 * pagination and column visibility are provided by {@link DataTable}.
 */
export function ShiftTemplatesTable({
    templates,
    isLoading = false,
    onEdit,
    onDuplicate,
    onUse,
    onDelete,
    canDelete = true,
}: ShiftTemplatesTableProps): JSX.Element {
    const columns: ColumnDef<ShiftTemplate>[] = [
        {
            id: 'name',
            accessorKey: 'name',
            header: 'Template',
            cell: ({ row }) => {
                const template = row.original;
                return (
                    <button
                        type="button"
                        onClick={() => onEdit(template)}
                        className="flex items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <TemplateAvatar color={template.color} />
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{template.name}</p>
                            <p className="truncate text-xs text-muted-foreground md:hidden">
                                {formatTimeRange(template.startTime, template.endTime)}
                            </p>
                        </div>
                    </button>
                );
            },
        },
        {
            id: 'time',
            accessorKey: 'startTime',
            header: 'Time',
            cell: ({ row }) => {
                const template = row.original;
                return (
                    <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="font-medium text-foreground">
                            {formatTimeRange(template.startTime, template.endTime)}
                        </span>
                        {isOvernight(template.startTime, template.endTime) ? (
                            <span
                                className="inline-flex items-center gap-1 rounded-full bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info"
                                title="Runs past midnight"
                            >
                                <MoonStar className="h-3 w-3" aria-hidden="true" />
                                Overnight
                            </span>
                        ) : null}
                    </div>
                );
            },
            meta: {
                headerClassName: 'hidden md:table-cell',
                cellClassName: 'hidden md:table-cell',
            },
        },
        {
            id: 'duration',
            header: 'Duration',
            accessorFn: (template) => computeSpanMinutes(template.startTime, template.endTime),
            cell: ({ row }) => (
                <span className="whitespace-nowrap font-medium text-foreground">
                    {formatDuration(computeSpanMinutes(row.original.startTime, row.original.endTime))}
                </span>
            ),
            meta: {
                headerClassName: 'hidden sm:table-cell',
                cellClassName: 'hidden sm:table-cell',
            },
        },
        {
            id: 'break',
            accessorKey: 'breakMinutes',
            header: 'Break',
            cell: ({ row }) => (
                <span className="whitespace-nowrap text-muted-foreground">
                    {describeBreak(row.original.breakMinutes, row.original.isPaidBreak)}
                </span>
            ),
            meta: {
                headerClassName: 'hidden lg:table-cell',
                cellClassName: 'hidden lg:table-cell',
            },
        },
        {
            id: 'payableHours',
            header: 'Payable',
            accessorFn: (template) =>
                computePaidMinutes(
                    computeSpanMinutes(template.startTime, template.endTime),
                    template.breakMinutes,
                    template.isPaidBreak,
                ),
            cell: ({ row }) => {
                const template = row.original;
                const paid = computePaidMinutes(
                    computeSpanMinutes(template.startTime, template.endTime),
                    template.breakMinutes,
                    template.isPaidBreak,
                );

                return (
                    <span className="whitespace-nowrap font-medium text-foreground">
                        {formatPaidHours(paid)}
                    </span>
                );
            },
            meta: {
                headerClassName: 'hidden xl:table-cell',
                cellClassName: 'hidden xl:table-cell',
            },
        },
        {
            id: 'position',
            accessorKey: 'positionName',
            header: 'Default role',
            cell: ({ row }) =>
                row.original.positionName ? (
                    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {row.original.positionName}
                    </span>
                ) : (
                    <EmptyCell />
                ),
            meta: {
                headerClassName: 'hidden lg:table-cell',
                cellClassName: 'hidden lg:table-cell',
            },
        },
        {
            id: 'scope',
            accessorKey: 'branchName',
            header: 'Scope',
            cell: ({ row }) => {
                const { branchName, departmentName } = row.original;

                if (!branchName && !departmentName) {
                    return <span className="text-muted-foreground">All branches</span>;
                }

                return (
                    <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">
                            {branchName ?? 'All branches'}
                        </p>
                        {departmentName ? (
                            <p className="truncate text-xs text-muted-foreground">
                                {departmentName}
                            </p>
                        ) : null}
                    </div>
                );
            },
            meta: {
                headerClassName: 'hidden xl:table-cell',
                cellClassName: 'hidden xl:table-cell',
            },
        },
        {
            id: 'status',
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <ShiftTemplateStatusBadge status={row.original.status} />,
        },
        {
            id: 'actions',
            header: '',
            enableHiding: false,
            cell: ({ row }) => (
                <div className="flex justify-end">
                    <TemplateActionsMenu
                        template={row.original}
                        onEdit={onEdit}
                        onDuplicate={onDuplicate}
                        onUse={onUse}
                        onDelete={onDelete}
                        canDelete={canDelete}
                    />
                </div>
            ),
            meta: { headerClassName: 'w-12', cellClassName: 'w-12' },
        },
    ];

    return (
        <DataTable<ShiftTemplate, unknown>
            columns={columns}
            data={templates}
            searchKey="name"
            searchPlaceholder="Search templates..."
            isLoading={isLoading}
        />
    );
}
