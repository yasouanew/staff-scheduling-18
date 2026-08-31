import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, CreditCard } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ErrorBoundary } from '@/Components/common/ErrorBoundary';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { EmptyState } from '@/Components/common/EmptyState';
import { PageHeader } from '@/Components/layout/PageHeader';
import { DataTable } from '@/Components/tables/DataTable';
import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { Pagination } from '@/Components/ui/pagination';
import { cn } from '@/lib/utils';
import type { PlatformSubscription } from '@/types/super-admin';

import { usePlatformSubscriptions } from '../hooks/useSuperAdmin';

/** Dedicated client so the page works standalone. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Semantic tone per subscription status for the platform badge. */
function statusTone(status: string): BadgeTone {
    switch (status) {
        case 'active':
            return 'success';
        case 'trialing':
            return 'info';
        case 'past_due':
        case 'grace_period':
            return 'warning';
        case 'cancelled':
        case 'expired':
            return 'neutral';
        case 'paused':
            return 'warning';
        default:
            return 'neutral';
    }
}

function statusLabel(status: string): string {
    switch (status) {
        case 'active':
            return 'Active';
        case 'trialing':
            return 'Trialing';
        case 'past_due':
            return 'Past due';
        case 'grace_period':
            return 'Grace period';
        case 'cancelled':
            return 'Cancelled';
        case 'expired':
            return 'Expired';
        case 'paused':
            return 'Paused';
        default:
            return status;
    }
}

function cycleLabel(cycle: string): string {
    switch (cycle) {
        case 'monthly':
            return 'Monthly';
        case 'six_month':
            return 'Every 6 months';
        case 'yearly':
            return 'Yearly';
        default:
            return cycle;
    }
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? '—' : format(parsed, 'dd MMM yyyy');
}

function SubscriptionStatusBadge({ subscription }: { subscription: PlatformSubscription }): JSX.Element {
    return (
        <Badge variant={statusTone(subscription.status)}>
            <span
                className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    subscription.isActive ? 'bg-current' : 'bg-muted-foreground',
                )}
                aria-hidden="true"
            />
            {statusLabel(subscription.status)}
        </Badge>
    );
}

const columns: ColumnDef<PlatformSubscription>[] = [
    {
        accessorKey: 'companyName',
        header: 'Company',
        cell: ({ row }) => (
            <div className="font-medium text-foreground">{row.original.companyName}</div>
        ),
    },
    {
        accessorKey: 'planName',
        header: 'Plan',
        cell: ({ row }) => <span className="text-sm">{row.original.planName}</span>,
    },
    {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <SubscriptionStatusBadge subscription={row.original} />,
    },
    {
        accessorKey: 'billingCycle',
        header: 'Billing',
        cell: ({ row }) => <span className="text-sm">{cycleLabel(row.original.billingCycle)}</span>,
    },
    {
        accessorKey: 'trialEndsAt',
        header: 'Trial ends',
        cell: ({ row }) => (
            <span className="text-sm text-muted-foreground">
                {row.original.onTrial ? formatDate(row.original.trialEndsAt) : '—'}
            </span>
        ),
    },
    {
        accessorKey: 'activeBranchesCount',
        header: 'Active branches',
        cell: ({ row }) => (
            <span className="text-sm tabular-nums">{row.original.activeBranchesCount}</span>
        ),
    },
    {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => (
            <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</span>
        ),
    },
];

function SubscriptionsOverview(): JSX.Element {
    const [page, setPage] = useState(1);
    const { data, isLoading, isError, refetch } = usePlatformSubscriptions(page);

    const subscriptions = useMemo(() => data?.data ?? [], [data]);
    const pageCount = data?.lastPage ?? 1;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Subscriptions"
                eyebrow="Platform"
                description="Every subscription across the platform — company, plan, billing cycle, trial and active branch usage. This is an operational view, not customer self-service."
            />

            {isError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Unable to load subscriptions</p>
                        <p className="text-sm text-muted-foreground">The platform query failed. Please try again.</p>
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
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <LoadingSkeleton key={index} className="h-8 w-full" radius="sm" />
                            ))}
                        </div>
                    ) : subscriptions.length === 0 ? (
                        <EmptyState
                            icon={CreditCard}
                            title="No subscriptions yet"
                            description="Subscriptions will appear here as companies subscribe to plans."
                        />
                    ) : (
                        <DataTable<PlatformSubscription, unknown>
                            columns={columns}
                            data={subscriptions}
                            searchKey="companyName"
                            searchPlaceholder="Search by company..."
                        />
                    )}
                    {!isLoading && pageCount > 1 && (
                        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
                    )}
                </div>
            )}
        </div>
    );
}

export default function SuperAdminSubscriptionsPage(): JSX.Element {
    return (
        <QueryClientProvider client={queryClient}>
            <ErrorBoundary
                title="Platform subscriptions unavailable"
                description="An unexpected error interrupted the subscriptions view. You can retry safely."
            >
                <SubscriptionsOverview />
            </ErrorBoundary>
        </QueryClientProvider>
    );
}
