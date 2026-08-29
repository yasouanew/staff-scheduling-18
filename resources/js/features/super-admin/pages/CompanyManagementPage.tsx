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
import { toast } from 'sonner';

import { ErrorBoundary } from '@/Components/common/ErrorBoundary';
import { StatCard } from '@/Components/common/StatCard';
import { DataTable } from '@/Components/tables/DataTable';
import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { formatAud } from '@/lib/chart';
import { cn } from '@/lib/utils';
import type { SubscriptionStatus, TenantCompany } from '@/types/super-admin';

import { useSetTenantStatus, useTenantCompanies } from '../hooks/useSuperAdmin';

/** Dedicated client so the ledger works standalone. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Label + semantic tone + dot token pairing per subscription status. */
const STATUS_MAP: Record<SubscriptionStatus, { label: string; tone: BadgeTone; dot: string }> = {
    active: { label: 'Active', tone: 'success', dot: 'bg-success' },
    trialing: { label: 'Trialing', tone: 'info', dot: 'bg-info' },
    past_due: { label: 'Past due', tone: 'warning', dot: 'bg-warning' },
    grace_period: { label: 'Grace period', tone: 'warning', dot: 'bg-warning' },
    suspended: { label: 'Suspended', tone: 'danger', dot: 'bg-danger' },
    cancelled: { label: 'Cancelled', tone: 'neutral', dot: 'bg-muted-foreground' },
    expired: { label: 'Expired', tone: 'neutral', dot: 'bg-muted-foreground' },
};

/**
 * Accessible subscription-status pill.
 *
 * Built on the shared `Badge` primitive so tenant statuses match every other
 * status pill in the application.
 */
function TenantStatusBadge({ status }: { status: SubscriptionStatus }): JSX.Element {
    const { label, tone, dot } = STATUS_MAP[status];
    return (
        <Badge variant={tone}>
            <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
            {label}
        </Badge>
    );
}

/** Single read-only field row inside the tenant details dialog. */
function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
        </div>
    );
}

/**
 * Per-row action menu: view tenant information or flag/suspend the tenant.
 * Owns its dialog state and calls the suspend/reactivate mutation directly, so
 * the column definition stays declarative.
 */
function CompanyActionsMenu({ tenant }: { tenant: TenantCompany }): JSX.Element {
    const setStatus = useSetTenantStatus();
    const [viewOpen, setViewOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const isSuspended = tenant.status === 'suspended';

    const handleConfirmSuspend = (): void => {
        setStatus.mutate(
            { tenantId: tenant.id, status: 'suspended' },
            {
                onSuccess: () => {
                    toast.success(`${tenant.name} suspended.`);
                    setConfirmOpen(false);
                },
                onError: () => toast.error('Unable to suspend tenant.'),
            },
        );
    };

    const handleReactivate = (): void => {
        setStatus.mutate(
            { tenantId: tenant.id, status: 'active' },
            {
                onSuccess: () => toast.success(`${tenant.name} reactivated.`),
                onError: () => toast.error('Unable to reactivate tenant.'),
            },
        );
    };

    return (
        <>
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        aria-label={`Actions for ${tenant.name}`}
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
                            View details
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="my-1 h-px bg-border" />
                        {isSuspended ? (
                            <DropdownMenu.Item
                                onSelect={handleReactivate}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-success outline-none transition-colors focus:bg-success/10"
                            >
                                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                                Reactivate tenant
                            </DropdownMenu.Item>
                        ) : (
                            <DropdownMenu.Item
                                onSelect={() => setConfirmOpen(true)}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-danger outline-none transition-colors focus:bg-danger/10"
                            >
                                <Ban className="h-4 w-4" aria-hidden="true" />
                                Suspend tenant
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
                                    {tenant.name}
                                </Dialog.Title>
                                <Dialog.Description className="text-sm text-muted-foreground">
                                    {tenant.contactEmail}
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
                            <DetailRow label="Plan" value={tenant.planName} />
                            <DetailRow label="Status" value={STATUS_MAP[tenant.status].label} />
                            <DetailRow
                                label="Active staff"
                                value={`${tenant.activeStaff.toLocaleString('en-AU')} / ${tenant.seatLimit.toLocaleString('en-AU')}`}
                            />
                            <DetailRow label="MRR" value={formatAud(tenant.mrr)} />
                            <DetailRow label="State" value={tenant.state} />
                            <DetailRow
                                label="Onboarded"
                                value={format(parseISO(tenant.createdAt), 'dd MMM yyyy')}
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
                            Suspend {tenant.name}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            The tenant will immediately lose access and billing will pause. You can
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
                                disabled={setStatus.isPending}
                                className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                            >
                                {setStatus.isPending ? 'Suspending…' : 'Suspend tenant'}
                            </button>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>
        </>
    );
}

/** Tenant ledger columns. */
const columns: ColumnDef<TenantCompany>[] = [
    {
        id: 'name',
        accessorKey: 'name',
        header: 'Company',
        cell: ({ row }) => (
            <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{row.original.name}</p>
                <p className="truncate text-xs text-muted-foreground">{row.original.contactEmail}</p>
            </div>
        ),
    },
    {
        id: 'plan',
        accessorKey: 'planName',
        header: 'Plan',
        cell: ({ row }) => <span className="text-foreground">{row.original.planName}</span>,
        meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
    },
    {
        id: 'activeStaff',
        accessorKey: 'activeStaff',
        header: 'Active Staff',
        cell: ({ row }) => (
            <span className="whitespace-nowrap text-muted-foreground">
                {row.original.activeStaff.toLocaleString('en-AU')}
                <span className="text-xs"> / {row.original.seatLimit.toLocaleString('en-AU')}</span>
            </span>
        ),
        meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
    },
    {
        id: 'mrr',
        accessorKey: 'mrr',
        header: 'MRR',
        cell: ({ row }) => (
            <span className="whitespace-nowrap font-medium text-foreground">
                {formatAud(row.original.mrr)}
            </span>
        ),
        meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' },
    },
    {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <TenantStatusBadge status={row.original.status} />,
    },
    {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
            <div className="flex justify-end">
                <CompanyActionsMenu tenant={row.original} />
            </div>
        ),
        meta: { headerClassName: 'w-12', cellClassName: 'w-12' },
    },
];

/** Inner ledger view (relies on an ancestor QueryClientProvider). */
function CompanyLedger(): JSX.Element {
    const { data, isLoading, isError, refetch } = useTenantCompanies();
    const tenants = useMemo(() => data ?? [], [data]);

    const counts = useMemo(
        () =>
            tenants.reduce(
                (acc, tenant) => {
                    acc.total += 1;
                    if (tenant.status === 'active' || tenant.status === 'trialing') acc.active += 1;
                    if (tenant.status === 'suspended') acc.suspended += 1;
                    return acc;
                },
                { total: 0, active: 0, suspended: 0 },
            ),
        [tenants],
    );

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Company Management
                </h1>
                <p className="text-sm text-muted-foreground">
                    Track every tenant organization, monitor subscription health and apply instant
                    overrides.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    title="Total Tenants"
                    value={counts.total}
                    icon={Building2}
                    tone="primary"
                    description="On the platform"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Active Tenants"
                    value={counts.active}
                    icon={CheckCircle2}
                    tone="success"
                    description="Active or trialing"
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
                            Unable to load tenants
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
                <DataTable<TenantCompany, unknown>
                    columns={columns}
                    data={tenants}
                    searchKey="name"
                    searchPlaceholder="Search companies..."
                    isLoading={isLoading}
                />
            )}
        </div>
    );
}

/**
 * Super Admin tenant ledger. Owns the feature-scoped QueryClient, guards the
 * view with an error boundary, and renders the tenant DataTable with semantic
 * status states plus per-row view/suspend overrides.
 */
export default function CompanyManagementPage(): JSX.Element {
    return (
        <QueryClientProvider client={queryClient}>
            <ErrorBoundary
                title="Company management unavailable"
                description="An unexpected error interrupted the tenant ledger. You can retry safely."
            >
                <CompanyLedger />
            </ErrorBoundary>
        </QueryClientProvider>
    );
}
