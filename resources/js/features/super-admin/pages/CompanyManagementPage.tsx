import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import {
    AlertTriangle,
    Ban,
    Building2,
    CheckCircle2,
    Eye,
    MoreHorizontal,
    ShieldCheck,
    X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { ErrorBoundary } from '@/Components/common/ErrorBoundary';
import { StatCard } from '@/Components/common/StatCard';
import { DataTable } from '@/Components/tables/DataTable';
import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Company, CompanyStatus } from '@/types/company';
import { COMPANY_STATUS_LABELS } from '@/types/company';

import { useTenantCompanies } from '../hooks/useSuperAdmin';
import { useUpdateCompanyStatus } from '@/features/companies/hooks/useCompanies';

/** Dedicated client so the ledger works standalone. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Label + semantic tone + dot token pairing per company status. */
const STATUS_MAP: Record<CompanyStatus, { label: string; tone: BadgeTone; dot: string }> = {
    active: { label: 'Active', tone: 'success', dot: 'bg-success' },
    inactive: { label: 'Inactive', tone: 'neutral', dot: 'bg-muted-foreground' },
    suspended: { label: 'Suspended', tone: 'danger', dot: 'bg-danger' },
};

/**
 * Accessible company-status pill.
 *
 * Built on the shared `Badge` primitive so company statuses match every other
 * status pill in the application.
 */
function CompanyStatusBadge({ status }: { status: CompanyStatus }): JSX.Element {
    const { label, tone, dot } = STATUS_MAP[status];
    return (
        <Badge variant={tone}>
            <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
            {label}
        </Badge>
    );
}

/** Single read-only field row inside the company details dialog. */
function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
        </div>
    );
}

/**
 * Per-row action menu: view company information or suspend/reactivate the
 * company. Owns its dialog state and calls the real companies status mutation
 * (`PUT /companies/{id}`), so there is a single status-update path.
 */
function CompanyActionsMenu({ company }: { company: Company }): JSX.Element {
    const updateStatus = useUpdateCompanyStatus();
    const [viewOpen, setViewOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const isSuspended = company.status === 'suspended';

    const handleConfirmSuspend = (): void => {
        updateStatus.mutate(
            { id: company.id, status: 'suspended' },
            {
                onSuccess: () => {
                    toast.success(`${company.name} suspended.`);
                    setConfirmOpen(false);
                },
                onError: (error) =>
                    toast.error('Unable to suspend company.', {
                        description: getApiErrorMessage(error, 'Please try again.'),
                    }),
            },
        );
    };

    const handleReactivate = (): void => {
        updateStatus.mutate(
            { id: company.id, status: 'active' },
            {
                onSuccess: () =>
                    toast.success(`${company.name} reactivated.`),
                onError: (error) =>
                    toast.error('Unable to reactivate company.', {
                        description: getApiErrorMessage(error, 'Please try again.'),
                    }),
            },
        );
    };

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
                        <DropdownMenu.Item
                            onSelect={() => setViewOpen(true)}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground"
                        >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                            Quick view
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                            asChild
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground"
                        >
                            <Link to={`/super-admin/companies/${company.id}`}>
                                <Building2 className="h-4 w-4" aria-hidden="true" />
                                Platform detail
                            </Link>
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="my-1 h-px bg-border" />
                        {isSuspended ? (
                            <DropdownMenu.Item
                                onSelect={handleReactivate}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-success outline-none transition-colors focus:bg-success/10"
                            >
                                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                                Reactivate company
                            </DropdownMenu.Item>
                        ) : (
                            <DropdownMenu.Item
                                onSelect={() => setConfirmOpen(true)}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-danger outline-none transition-colors focus:bg-danger/10"
                            >
                                <Ban className="h-4 w-4" aria-hidden="true" />
                                Suspend company
                            </DropdownMenu.Item>
                        )}
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>

            {/* View details dialog */}
            <Dialog.Root open={viewOpen} onOpenChange={setViewOpen}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <div className="mb-4 flex items-start justify-between">
                            <div>
                                <Dialog.Title className="text-lg font-semibold text-foreground">
                                    {company.name}
                                </Dialog.Title>
                                <Dialog.Description className="text-sm text-muted-foreground">
                                    {company.email ?? 'No contact email'}
                                </Dialog.Description>
                            </div>
                            <Dialog.Close asChild>
                                <button
                                    type="button"
                                    aria-label="Close"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </Dialog.Close>
                        </div>
                        <dl className="divide-y divide-border">
                            <DetailRow
                                label="Status"
                                value={COMPANY_STATUS_LABELS[company.status]}
                            />
                            <DetailRow
                                label="Branches"
                                value={String(company.branchesCount ?? 0)}
                            />
                            <DetailRow
                                label="Employees"
                                value={String(company.employeesCount ?? 0)}
                            />
                            <DetailRow label="Users" value={String(company.usersCount ?? 0)} />
                            <DetailRow
                                label="ABN"
                                value={company.abn ?? '—'}
                            />
                            <DetailRow
                                label="State"
                                value={company.state ?? '—'}
                            />
                            <DetailRow
                                label="Onboarded"
                                value={
                                    company.createdAt
                                        ? format(parseISO(company.createdAt), 'dd MMM yyyy')
                                        : '—'
                                }
                            />
                        </dl>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>

            {/* Suspend confirmation */}
            <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Suspend {company.name}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            The company will immediately lose access to the platform. You can
                            reactivate them at any time.
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
                            <button
                                type="button"
                                onClick={handleConfirmSuspend}
                                disabled={updateStatus.isPending}
                                className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                            >
                                {updateStatus.isPending ? 'Suspending…' : 'Suspend company'}
                            </button>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>
        </>
    );
}

/** Company ledger columns. */
const columns: ColumnDef<Company>[] = [
    {
        id: 'name',
        accessorKey: 'name',
        header: 'Company',
        cell: ({ row }) => (
            <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{row.original.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                    {row.original.email ?? 'No contact email'}
                </p>
            </div>
        ),
    },
    {
        id: 'branches',
        accessorKey: 'branchesCount',
        header: 'Branches',
        cell: ({ row }) => (
            <span className="whitespace-nowrap text-muted-foreground">
                {row.original.branchesCount ?? 0}
            </span>
        ),
        meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
    },
    {
        id: 'employees',
        accessorKey: 'employeesCount',
        header: 'Employees',
        cell: ({ row }) => (
            <span className="whitespace-nowrap text-muted-foreground">
                {(row.original.employeesCount ?? 0).toLocaleString('en-AU')}
            </span>
        ),
        meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
    },
    {
        id: 'users',
        accessorKey: 'usersCount',
        header: 'Users',
        cell: ({ row }) => (
            <span className="whitespace-nowrap text-muted-foreground">
                {row.original.usersCount ?? 0}
            </span>
        ),
        meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
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
                <CompanyActionsMenu company={row.original} />
            </div>
        ),
        meta: { headerClassName: 'w-12', cellClassName: 'w-12' },
    },
];

/** Inner ledger view (relies on an ancestor QueryClientProvider). */
function CompanyLedger(): JSX.Element {
    const { data, isLoading, isError, refetch } = useTenantCompanies();
    const companies = useMemo(() => data ?? [], [data]);

    const counts = useMemo(
        () =>
            companies.reduce(
                (acc, company) => {
                    acc.total += 1;
                    if (company.status === 'active') acc.active += 1;
                    if (company.status === 'suspended') acc.suspended += 1;
                    return acc;
                },
                { total: 0, active: 0, suspended: 0 },
            ),
        [companies],
    );

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Company Management
                </h1>
                <p className="text-sm text-muted-foreground">
                    Track every tenant organisation, monitor account status and apply instant
                    overrides.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    title="Total Companies"
                    value={counts.total}
                    icon={Building2}
                    tone="primary"
                    description="On the platform"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Active Companies"
                    value={counts.active}
                    icon={CheckCircle2}
                    tone="success"
                    description="Currently active"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Suspended"
                    value={counts.suspended}
                    icon={Ban}
                    tone="danger"
                    description="Access paused"
                    isLoading={isLoading}
                />
            </div>

            {isError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                            Unable to load companies
                        </p>
                        <p className="text-sm text-muted-foreground">
                            A cross-tenant query failed. Please try again.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void refetch()}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <DataTable<Company, unknown>
                    columns={columns}
                    data={companies}
                    searchKey="name"
                    searchPlaceholder="Search companies..."
                    isLoading={isLoading}
                />
            )}
        </div>
    );
}

/**
 * Super Admin company ledger. Owns the feature-scoped QueryClient, guards the
 * view with an error boundary, and renders the company DataTable with semantic
 * status states plus per-row view/suspend overrides — all backed by the real
 * companies API.
 */
export default function CompanyManagementPage(): JSX.Element {
    return (
        <QueryClientProvider client={queryClient}>
            <ErrorBoundary
                title="Company management unavailable"
                description="An unexpected error interrupted the company ledger. You can retry safely."
            >
                <CompanyLedger />
            </ErrorBoundary>
        </QueryClientProvider>
    );
}
