import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, Building2, Eye, MoreHorizontal, Pencil, Power, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { DataTable } from '@/Components/tables/DataTable';
import { cn } from '@/lib/utils';
import { type Company, type CompanyStatus } from '@/types/company';

import { getCompanyInitials } from './company-initials';
import { CompanyStatusBadge } from './CompanyStatusBadge';

interface CompaniesTableProps {
    /** Companies to render (already fetched by the parent page). */

    companies: Company[];
    /** Shows skeleton rows while the parent query is loading. */
    isLoading?: boolean;
    /** Navigate to the company detail page. */
    onView: (company: Company) => void;
    /** Open the edit drawer for a company. */
    onEdit: (company: Company) => void;
    /** Change a company's lifecycle status. */
    onStatusChange: (company: Company, status: CompanyStatus) => void;
}

/** Small logo chip with an image or initials fallback. */
function CompanyLogo({ company }: { company: Company }): JSX.Element {
    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent text-xs font-semibold text-accent-foreground">
            {company.logo ? (
                <img
                    src={company.logo}
                    alt=""
                    className="h-full w-full object-contain"
                    loading="lazy"
                />
            ) : (
                getCompanyInitials(company.name) || (
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                )
            )}
        </span>
    );
}


/**
 * Per-row action menu: view, edit and status transitions. Suspending is a
 * destructive action so it is gated behind a confirmation dialog. All effects
 * are delegated to the parent via callbacks, keeping this component
 * presentational.
 */
function CompanyActionsMenu({
    company,
    onView,
    onEdit,
    onStatusChange,
}: {
    company: Company;
    onView: (company: Company) => void;
    onEdit: (company: Company) => void;
    onStatusChange: (company: Company, status: CompanyStatus) => void;
}): JSX.Element {
    const [confirmSuspend, setConfirmSuspend] = useState(false);

    const itemClasses =
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground';

    return (
        <>
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        aria-label={`Actions for ${company.name}`}
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
                        <DropdownMenu.Item onSelect={() => onView(company)} className={itemClasses}>
                            <Eye className="h-4 w-4" aria-hidden="true" />
                            View details
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => onEdit(company)} className={itemClasses}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit company
                        </DropdownMenu.Item>

                        <DropdownMenu.Separator className="my-1 h-px bg-border" />

                        {company.status !== 'active' && (
                            <DropdownMenu.Item
                                onSelect={() => onStatusChange(company, 'active')}
                                className={cn(itemClasses, 'text-success focus:bg-success/10')}
                            >
                                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                                Set active
                            </DropdownMenu.Item>
                        )}
                        {company.status !== 'inactive' && (
                            <DropdownMenu.Item
                                onSelect={() => onStatusChange(company, 'inactive')}
                                className={itemClasses}
                            >
                                <Power className="h-4 w-4" aria-hidden="true" />
                                Set inactive
                            </DropdownMenu.Item>
                        )}
                        {company.status !== 'suspended' && (
                            <DropdownMenu.Item
                                onSelect={() => setConfirmSuspend(true)}
                                className={cn(itemClasses, 'text-danger focus:bg-danger/10')}
                            >
                                <Ban className="h-4 w-4" aria-hidden="true" />
                                Suspend company
                            </DropdownMenu.Item>
                        )}
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <AlertDialog.Root open={confirmSuspend} onOpenChange={setConfirmSuspend}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Suspend {company.name}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            The organisation will immediately lose access until reactivated. You can
                            set it back to active at any time.
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
                                    onClick={() => onStatusChange(company, 'suspended')}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Suspend company
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
 * Companies data table. Pure presentational wrapper around the reusable
 * {@link DataTable}: it declares the columns (with logo, contact, industry,
 * headcount, status pill and a per-row actions menu) and delegates all effects
 * to the parent through callbacks. Search, sorting, pagination and column
 * visibility are provided by {@link DataTable}.
 */
export function CompaniesTable({
    companies,
    isLoading = false,
    onView,
    onEdit,
    onStatusChange,
}: CompaniesTableProps): JSX.Element {
    const columns: ColumnDef<Company>[] = [
        {
            id: 'name',
            accessorKey: 'name',
            header: 'Company',
            cell: ({ row }) => {
                const company = row.original;
                return (
                    <button
                        type="button"
                        onClick={() => onView(company)}
                        className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
                    >
                        <CompanyLogo company={company} />
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{company.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                                {company.email ?? 'No contact email'}
                            </p>
                        </div>
                    </button>
                );
            },
        },
        {
            id: 'abn',
            accessorKey: 'abn',
            header: 'ABN',
            cell: ({ row }) => (
                <span className="whitespace-nowrap text-muted-foreground">
                    {row.original.abn ?? '—'}
                </span>
            ),
            meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
        },
        {
            id: 'businessType',
            accessorKey: 'businessType',
            header: 'Industry',
            cell: ({ row }) => (
                <span className="text-muted-foreground">{row.original.businessType ?? '—'}</span>
            ),
            meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
        },
        {
            id: 'location',
            header: 'Location',
            accessorFn: (row) => [row.state, row.country].filter(Boolean).join(', '),
            cell: ({ row }) => {
                const parts = [row.original.state, row.original.country].filter(Boolean);
                return (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {parts.length > 0 ? parts.join(', ') : '—'}
                    </span>
                );
            },
            meta: { headerClassName: 'hidden xl:table-cell', cellClassName: 'hidden xl:table-cell' },
        },
        {
            id: 'employeesCount',
            accessorKey: 'employeesCount',
            header: 'Staff',
            cell: ({ row }) => (
                <span className="whitespace-nowrap text-muted-foreground">
                    {row.original.employeesCount?.toLocaleString('en-AU') ?? '—'}
                </span>
            ),
            meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' },
        },
        {
            id: 'status',
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <CompanyStatusBadge status={row.original.status} />,
        },
        {
            id: 'actions',
            header: '',
            enableHiding: false,
            cell: ({ row }) => (
                <div className="flex justify-end">
                    <CompanyActionsMenu
                        company={row.original}
                        onView={onView}
                        onEdit={onEdit}
                        onStatusChange={onStatusChange}
                    />
                </div>
            ),
            meta: { headerClassName: 'w-12', cellClassName: 'w-12' },
        },
    ];

    return (
        <DataTable<Company, unknown>
            columns={columns}
            data={companies}
            searchKey="name"
            searchPlaceholder="Search companies..."
            isLoading={isLoading}
        />
    );
}
