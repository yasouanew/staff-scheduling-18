import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ErrorBoundary } from '@/Components/common/ErrorBoundary';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { EmptyState } from '@/Components/common/EmptyState';
import { PageHeader } from '@/Components/layout/PageHeader';
import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { Pagination } from '@/Components/ui/pagination';
import { cn } from '@/lib/utils';
import type { PlatformAuditEvent } from '@/types/super-admin';

import { usePlatformAudit } from '../hooks/useSuperAdmin';

/** Dedicated client so the page works standalone. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Human-friendly labels for the platform event vocabulary. */
function eventLabel(event: string): string {
    switch (event) {
        case 'plan_changed':
            return 'Plan changed';
        case 'plan_created':
            return 'Plan created';
        case 'plan_updated':
            return 'Plan updated';
        case 'plan_deactivated':
            return 'Plan deactivated';
        case 'plan_activated':
            return 'Plan activated';
        case 'subscription_created':
            return 'Subscription created';
        case 'subscription_cancelled':
            return 'Subscription cancelled';
        case 'subscription_resumed':
            return 'Subscription resumed';
        case 'subscription_swapped':
            return 'Subscription plan changed';
        case 'payment_failed':
            return 'Payment failed';
        case 'payment_succeeded':
            return 'Payment succeeded';
        case 'refund_issued':
            return 'Refund issued';
        case 'company_suspended':
            return 'Company suspended';
        case 'company_reactivated':
            return 'Company reactivated';
        case 'company_created':
            return 'Company created';
        default:
            return event.replace(/_/g, ' ');
    }
}

function eventTone(event: string): BadgeTone {
    switch (event) {
        case 'payment_failed':
            return 'danger';
        case 'refund_issued':
        case 'company_suspended':
            return 'warning';
        case 'payment_succeeded':
        case 'company_reactivated':
        case 'plan_activated':
            return 'success';
        default:
            return 'info';
    }
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? '—' : format(parsed, 'dd MMM yyyy, HH:mm');
}

function AuditRow({ event }: { event: PlatformAuditEvent }): JSX.Element {
    return (
        <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={eventTone(event.event)}>{eventLabel(event.event)}</Badge>
                    {event.companyName && (
                        <span className="text-sm font-medium text-foreground">{event.companyName}</span>
                    )}
                </div>
                <p className="text-sm text-muted-foreground">
                    {event.description || 'No description provided.'}
                </p>
            </div>
            <div className="shrink-0 space-y-1 text-right">
                <p className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</p>
                <p className="text-xs text-muted-foreground">
                    {event.causerName ? `by ${event.causerName}` : 'by system'}
                </p>
            </div>
        </li>
    );
}

function AuditOverview(): JSX.Element {
    const [page, setPage] = useState(1);
    const { data, isLoading, isError, refetch } = usePlatformAudit(page);

    const events = useMemo(() => data?.data ?? [], [data]);
    const pageCount = data?.lastPage ?? 1;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Audit"
                eyebrow="Platform"
                description="Platform-level events only — plan and subscription changes, payment failures, refunds and company status changes."
            />

            {isError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Unable to load the audit log</p>
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
                            {Array.from({ length: 8 }).map((_, index) => (
                                <LoadingSkeleton key={index} className="h-10 w-full" radius="sm" />
                            ))}
                        </div>
                    ) : events.length === 0 ? (
                        <EmptyState
                            icon={ScrollText}
                            title="No platform events yet"
                            description="Plan, subscription, payment and company events will be recorded here."
                        />
                    ) : (
                        <ul className="divide-y divide-border rounded-xl border border-border bg-card p-5 shadow-sm">
                            {events.map((event) => (
                                <AuditRow key={event.id} event={event} />
                            ))}
                        </ul>
                    )}
                    {!isLoading && pageCount > 1 && (
                        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
                    )}
                </div>
            )}
        </div>
    );
}

export default function SuperAdminAuditPage(): JSX.Element {
    return (
        <QueryClientProvider client={queryClient}>
            <ErrorBoundary
                title="Platform audit unavailable"
                description="An unexpected error interrupted the audit log. You can retry safely."
            >
                <AuditOverview />
            </ErrorBoundary>
        </QueryClientProvider>
    );
}
