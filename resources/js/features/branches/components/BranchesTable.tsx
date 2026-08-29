import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2, CreditCard, Eye, MapPin, MoreHorizontal, Pencil, Trash2, UserCog } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/Components/ui/badge';
import { DataTable } from '@/Components/tables/DataTable';
import type { BranchUsageItem } from '@/features/billing/types';
import { formatCapacity } from '@/features/billing/lib/format';
import { cn } from '@/lib/utils';
import { TIMEZONE_LABELS, type Branch } from '@/types/branch';

import { BranchStatusBadge } from './BranchStatusBadge';

interface BranchesTableProps {
    /** Branches to render (already fetched by the parent page). */
    branches: Branch[];
    /** Shows skeleton rows while the parent query is loading. */
    isLoading?: boolean;
    /** Per-branch subscription usage from the billing usage endpoint. */
    usage?: BranchUsageItem[];
    /** Open the subscription/capacity management dialog for a branch. */
    onManageSubscription?: (branch: Branch) => void;
    /** Navigate to the branch detail page. */
    onView: (branch: Branch) => void;
    /** Open the edit drawer for a branch. */
    onEdit: (branch: Branch) => void;
    /** Permanently delete a branch (parent handles the mutation + toast). */
    onDelete: (branch: Branch) => void;
}

/** Small location chip used as the branch avatar. */
function BranchIcon(): JSX.Element {
    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Building2 className="h-4 w-4" aria-hidden="true" />
        </span>
    );
}

/**
 * Per-row action menu: view, edit and delete. Deleting is a destructive action
 * so it is gated behind a confirmation dialog (per UX rules). All effects are
 * delegated to the parent via callbacks, keeping this component presentational.
 */
function BranchActionsMenu({
    branch,
    onView,
    onEdit,
    onManageSubscription,
    onDelete,
}: {
    branch: Branch;
    onView: (branch: Branch) => void;
    onEdit: (branch: Branch) => void;
    onManageSubscription?: (branch: Branch) => void;
    onDelete: (branch: Branch) => void;
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
                        aria-label={`Actions for ${branch.name}`}
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
                        <DropdownMenu.Item onSelect={() => onView(branch)} className={itemClasses}>
                            <Eye className="h-4 w-4" aria-hidden="true" />
                            View details
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => onEdit(branch)} className={itemClasses}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit branch
                        </DropdownMenu.Item>

                        {onManageSubscription && (
                            <DropdownMenu.Item onSelect={() => onManageSubscription(branch)} className={itemClasses}>
                                <CreditCard className="h-4 w-4" aria-hidden="true" />
                                Manage subscription
                            </DropdownMenu.Item>
                        )}

                        <DropdownMenu.Separator className="my-1 h-px bg-border" />

                        <DropdownMenu.Item
                            onSelect={() => setConfirmDelete(true)}
                            className={cn(itemClasses, 'text-danger focus:bg-danger/10')}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete branch
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Delete {branch.name}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            This will permanently remove the branch and cannot be undone. Employees
                            and shifts linked to this location may be affected.
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
                                    onClick={() => onDelete(branch)}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Delete branch
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
 * Branches data table. Pure presentational wrapper around the reusable
 * {@link DataTable}: it declares the columns (name, address, phone, timezone,
 * status pill and a per-row actions menu) and delegates all effects to the
 * parent through callbacks. Search, sorting, pagination and column visibility
 * are provided by {@link DataTable}.
 */
export function BranchesTable({
    branches,
    isLoading = false,
    usage = [],
    onManageSubscription,
    onView,
    onEdit,
    onDelete,
}: BranchesTableProps): JSX.Element {
    /** Look up a branch's subscription usage by id (falls back to a blank entry). */
    const usageFor = (branch: Branch): BranchUsageItem | undefined =>
        usage.find((item) => String(item.id) === String(branch.id));
    const columns: ColumnDef<Branch>[] = [
        {
            id: 'name',
            accessorKey: 'name',
            header: 'Branch',
            cell: ({ row }) => {
                const branch = row.original;
                return (
                    <button
                        type="button"
                        onClick={() => onView(branch)}
                        className="flex items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <BranchIcon />
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{branch.name}</p>
                            <p className="truncate text-xs text-muted-foreground sm:hidden">
                                {branch.address ?? 'No address'}
                            </p>
                        </div>
                    </button>
                );
            },
        },
        {
            id: 'address',
            accessorKey: 'address',
            header: 'Address',
            cell: ({ row }) => (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{row.original.address ?? '—'}</span>
                </span>
            ),
            meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
        },
        {
            id: 'phone',
            accessorKey: 'phone',
            header: 'Phone',
            cell: ({ row }) => (
                <span className="whitespace-nowrap text-muted-foreground">
                    {row.original.phone ?? '—'}
                </span>
            ),
            meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
        },
        {
            id: 'manager',
            accessorFn: (branch) => branch.manager?.name ?? '',
            header: 'Manager',
            cell: ({ row }) => {
                const manager = row.original.manager;
                return (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                        <UserCog className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{manager?.name ?? '—'}</span>
                    </span>
                );
            },
            meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
        },
        {
            id: 'timezone',
            accessorKey: 'timezone',
            header: 'Timezone',
            cell: ({ row }) => {
                const tz = row.original.timezone;
                return (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {tz ? (TIMEZONE_LABELS[tz] ?? tz) : '—'}
                    </span>
                );
            },
            meta: { headerClassName: 'hidden xl:table-cell', cellClassName: 'hidden xl:table-cell' },
        },
        {
            id: 'status',
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <BranchStatusBadge status={row.original.status} />,
        },
        {
            id: 'subscription',
            accessorFn: (branch) => (usageFor(branch)?.active ? 'Active' : 'Inactive'),
            header: 'Subscription',
            cell: ({ row }) => {
                const item = usageFor(row.original);
                if (!item) {
                    return (
                        <span className="text-xs text-muted-foreground">—</span>
                    );
                }
                return (
                    <div className="flex items-center gap-2">
                        <Badge variant={item.active ? 'success' : 'neutral'}>{item.active ? 'Active' : 'Inactive'}</Badge>
                        {item.active && (
                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                                {item.employeesUsed} / {formatCapacity(item.employeeCapacity)} employees
                            </span>
                        )}
                    </div>
                );
            },
            meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
        },
        {
            id: 'actions',
            header: '',
            enableHiding: false,
            cell: ({ row }) => (
                <div className="flex justify-end">
                    <BranchActionsMenu
                        branch={row.original}
                        onView={onView}
                        onEdit={onEdit}
                        onManageSubscription={onManageSubscription}
                        onDelete={onDelete}
                    />
                </div>
            ),
            meta: { headerClassName: 'w-12', cellClassName: 'w-12' },
        },
    ];

    return (
        <DataTable<Branch, unknown>
            columns={columns}
            data={branches}
            searchKey="name"
            searchPlaceholder="Search branches..."
            isLoading={isLoading}
        />
    );
}
