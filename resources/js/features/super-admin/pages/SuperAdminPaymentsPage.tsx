import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, ReceiptText } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ErrorBoundary } from '@/Components/common/ErrorBoundary';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { EmptyState } from '@/Components/common/EmptyState';
import { PageHeader } from '@/Components/layout/PageHeader';
import { DataTable } from '@/Components/tables/DataTable';
import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { Pagination } from '@/Components/ui/pagination';
import { cn } from '@/lib/utils';
import type { PlatformPayment } from '@/types/super-admin';

import { usePlatformPayments } from '../hooks/useSuperAdmin';

/** Dedicated client so the page works standalone. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function statusTone(status: string): BadgeTone {
    switch (status) {
        case 'succeeded':
            return 'success';
        case 'failed':
            return 'danger';
        case 'pending':
            return 'warning';
        case 'refunded':
            return 'neutral';
        default:
            return 'neutral';
    }
}

function statusLabel(status: string): string {
    switch (status) {
        case 'succeeded':
            return 'Paid';
        case 'failed':
            return 'Failed';
        case 'pending':
            return 'Pending';
        case 'refunded':
            return 'Refunded';
        default:
            return status;
    }
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? '—' : format(parsed, 'dd MMM yyyy');
}

function formatMoney(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency: currency || 'AUD',
        }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency || 'AUD'}`;
    }
}

function PaymentStatusBadge({ payment }: { payment: PlatformPayment }): JSX.Element {
    return (
        <Badge variant={statusTone(payment.isRefunded ? 'refunded' : payment.status)}>
            <span
                className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    payment.status === 'succeeded' ? 'bg-current' : 'bg-muted-foreground',
                )}
                aria-hidden="true"
            />
            {statusLabel(payment.isRefunded ? 'refunded' : payment.status)}
        </Badge>
    );
}

const columns: ColumnDef<PlatformPayment>[] = [
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
        cell: ({ row }) => <span className="text-sm">{row.original.planName ?? '—'}</span>,
    },
    {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
            <span className="text-sm font-medium tabular-nums">
                {formatMoney(row.original.amount, row.original.currency)}
            </span>
        ),
    },
    {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <PaymentStatusBadge payment={row.original} />,
    },
    {
        accessorKey: 'refundedAt',
        header: 'Refunded',
        cell: ({ row }) =>
            row.original.isRefunded ? (
                <div className="text-sm">
                    <span className="block text-muted-foreground">{formatDate(row.original.refundedAt)}</span>
                    <span className="text-xs text-danger">
                        {formatMoney(row.original.amountRefunded, row.original.currency)}
                    </span>
                </div>
            ) : (
                <span className="text-sm text-muted-foreground">—</span>
            ),
    },
    {
        accessorKey: 'paidAt',
        header: 'Paid',
        cell: ({ row }) => (
            <span className="text-sm text-muted-foreground">{formatDate(row.original.paidAt)}</span>
        ),
    },
    {
        accessorKey: 'provider',
        header: 'Provider',
        cell: ({ row }) => (
            <span className="text-sm capitalize text-muted-foreground">
                {row.original.provider ?? '—'}
            </span>
        ),
    },
    {
        accessorKey: 'reference',
        header: 'Reference',
        cell: ({ row }) => (
            <span className="font-mono text-xs text-muted-foreground">
                {row.original.reference ?? '—'}
            </span>
        ),
    },
];

function PaymentsOverview(): JSX.Element {
    const [page, setPage] = useState(1);
    const { data, isLoading, isError, refetch } = usePlatformPayments(page);

    const payments = useMemo(() => data?.data ?? [], [data]);
    const pageCount = data?.lastPage ?? 1;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Payments"
                eyebrow="Platform"
                description="Real payment and invoice data across every tenant, traceable to its company and plan. Refund status reflects the provider flow."
            />

            {isError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Unable to load payments</p>
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
                    ) : payments.length === 0 ? (
                        <EmptyState
                            icon={ReceiptText}
                            title="No payments yet"
                            description="Successful or attempted payments will appear here as subscriptions bill."
                        />
                    ) : (
                        <DataTable<PlatformPayment, unknown>
                            columns={columns}
                            data={payments}
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

export default function SuperAdminPaymentsPage(): JSX.Element {
    return (
        <QueryClientProvider client={queryClient}>
            <ErrorBoundary
                title="Platform payments unavailable"
                description="An unexpected error interrupted the payments view. You can retry safely."
            >
                <PaymentsOverview />
            </ErrorBoundary>
        </QueryClientProvider>
    );
}
