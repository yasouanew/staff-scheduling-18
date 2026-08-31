import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
    AlertTriangle,
    Building2,
    CalendarCheck2,
    CreditCard,
    TrendingUp,
    Users,
    Wallet,
} from 'lucide-react';
import { useMemo } from 'react';

import { EmptyState } from '@/Components/common/EmptyState';
import { ErrorBoundary } from '@/Components/common/ErrorBoundary';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { StatCard } from '@/Components/common/StatCard';
import { cn } from '@/lib/utils';
import type {
    DistributionTone,
    PlanDistributionSlice,
    RecentCompanyDto,
} from '@/types/super-admin';

import { usePlatformBillingMetrics, usePlatformMetrics } from '../hooks/useSuperAdmin';

/** Dedicated client so the platform dashboard works standalone. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Semantic bar/text token pairs for the plan distribution rows. */
const TONE_BAR: Record<DistributionTone, string> = {
    primary: 'bg-primary',
    success: 'bg-success',
    info: 'bg-info',
    warning: 'bg-warning',
};

/** Formats an amount as AUD currency. */
function formatMoney(value: number | undefined): string {
    if (value === undefined || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
        maximumFractionDigits: 0,
    }).format(value);
}

/** Formats a churn rate (fraction) as a percentage. */
function formatPercent(value: number | undefined): string {
    if (value === undefined || Number.isNaN(value)) return '—';
    return `${(value * 100).toFixed(1)}%`;
}

/** Company status pill tone helper. */
function statusTone(status: string): string {
    switch (status) {
        case 'active':
            return 'bg-success/10 text-success';
        case 'suspended':
            return 'bg-danger/10 text-danger';
        default:
            return 'bg-muted text-muted-foreground';
    }
}

function statusLabel(status: string): string {
    switch (status) {
        case 'active':
            return 'Active';
        case 'suspended':
            return 'Suspended';
        default:
            return 'Inactive';
    }
}

/** A single plan-distribution row with a semantic share bar. */
function DistributionRow({ slice }: { slice: PlanDistributionSlice }): JSX.Element {
    return (
        <li className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{slice.planName}</span>
                <span className="text-muted-foreground">
                    {slice.tenantCount} · {slice.sharePct}%
                </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className={cn('h-full rounded-full transition-all', TONE_BAR[slice.tone])}
                    style={{ width: `${slice.sharePct}%` }}
                />
            </div>
        </li>
    );
}

/** A single recently onboarded company row with status pill. */
function RecentCompanyRow({ company }: { company: RecentCompanyDto }): JSX.Element {
    return (
        <li className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{company.name}</p>
                <p className="text-xs text-muted-foreground">
                    Onboarded {format(parseISO(company.created_at), 'dd MMM yyyy')}
                </p>
            </div>
            <span
                className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                    statusTone(company.status),
                )}
            >
                {statusLabel(company.status)}
            </span>
        </li>
    );
}

/** Inner dashboard view (relies on an ancestor QueryClientProvider). */
function PlatformOverview(): JSX.Element {
    const { data, isLoading, isError, refetch } = usePlatformMetrics();
    const {
        data: billing,
        isLoading: billingLoading,
    } = usePlatformBillingMetrics();

    const recentCompanies = useMemo(() => data?.recentCompanies ?? [], [data]);
    const hasPlans = (data?.planDistribution.length ?? 0) > 0;

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Platform Overview
                </h1>
                <p className="text-sm text-muted-foreground">
                    Cross-tenant adoption, plan distribution and recent activity across the
                    platform.
                </p>
            </div>

            {/* Aggregation metrics ribbon — all values come from the live platform dashboard */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Total Companies"
                    value={data?.stats.totalCompanies ?? 0}
                    icon={Building2}
                    tone="primary"
                    description="Registered on the platform"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Active Companies"
                    value={data?.stats.activeCompanies ?? 0}
                    icon={TrendingUp}
                    tone="success"
                    description={`${data?.suspendedTenants ?? 0} suspended`}
                    isLoading={isLoading}
                />
                <StatCard
                    title="Total Employees"
                    value={(data?.stats.totalEmployees ?? 0).toLocaleString('en-AU')}
                    icon={Users}
                    tone="info"
                    description="Across all companies"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Active Subscriptions"
                    value={data?.stats.activeSubscriptions ?? 0}
                    icon={CreditCard}
                    tone="warning"
                    description="Paid subscription plans"
                    isLoading={isLoading}
                />
            </div>

            {/* Revenue & retention ribbon — real MRR/ARR/Revenue/Churn aggregates */}
            <div className="space-y-3">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                        Revenue & Retention
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Real billing aggregates across all tenants.
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        title="Monthly Recurring Revenue"
                        value={formatMoney(billing?.mrr)}
                        icon={Wallet}
                        tone="primary"
                        description="MRR from active subscriptions"
                        isLoading={billingLoading}
                    />
                    <StatCard
                        title="Annual Recurring Revenue"
                        value={formatMoney(billing?.arr)}
                        icon={Wallet}
                        tone="success"
                        description="ARR projection"
                        isLoading={billingLoading}
                    />
                    <StatCard
                        title="Total Revenue"
                        value={formatMoney(billing?.revenue)}
                        icon={TrendingUp}
                        tone="info"
                        description="Accumulated across tenants"
                        isLoading={billingLoading}
                    />
                    <StatCard
                        title="Churn Rate"
                        value={formatPercent(billing?.churnRate)}
                        icon={Users}
                        tone={billing && billing.churnRate > 0 ? 'danger' : 'warning'}
                        description={
                            billing
                                ? `${billing.churnedCount} churned / ${billing.churnActiveBase} active`
                                : 'Retention across tenants'
                        }
                        isLoading={billingLoading}
                    />
                </div>
            </div>

            {isError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                            Unable to load platform metrics
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
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Plan distribution */}
                    <section
                        className="rounded-xl border border-border bg-card p-5 shadow-sm"
                        aria-label="Plan distribution"
                    >
                        <header className="mb-4">
                            <h2 className="text-base font-semibold tracking-tight text-foreground">
                                Plan Distribution
                            </h2>
                            <p className="text-sm text-muted-foreground">Companies by subscription plan</p>
                        </header>

                        {isLoading ? (
                            <div className="space-y-4">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div key={index} className="space-y-2">
                                        <LoadingSkeleton className="h-3.5 w-2/5" radius="sm" />
                                        <LoadingSkeleton className="h-2 w-full" radius="sm" />
                                    </div>
                                ))}
                            </div>
                        ) : !hasPlans ? (
                            <EmptyState
                                title="No subscriptions yet"
                                description="Plan adoption will appear here as companies subscribe."
                                className="border-0 bg-transparent p-6"
                            />
                        ) : (
                            <ul className="space-y-4">
                                {data?.planDistribution.map((slice) => (
                                    <DistributionRow key={slice.id} slice={slice} />
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Recent companies */}
                    <section
                        className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2"
                        aria-label="Recent companies"
                    >
                        <header className="mb-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-semibold tracking-tight text-foreground">
                                    Recent Companies
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Newest tenants on the platform
                                </p>
                            </div>
                            <CalendarCheck2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </header>

                        {isLoading ? (
                            <div className="space-y-4">
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <div key={index} className="space-y-2">
                                        <LoadingSkeleton className="h-4 w-2/5" radius="sm" />
                                        <LoadingSkeleton className="h-3 w-3/5" radius="sm" />
                                    </div>
                                ))}
                            </div>
                        ) : recentCompanies.length === 0 ? (
                            <EmptyState
                                title="No companies yet"
                                description="Newly created companies will appear here."
                                className="border-0 bg-transparent p-6"
                            />
                        ) : (
                            <ul className="divide-y divide-border">
                                {recentCompanies.map((company) => (
                                    <RecentCompanyRow key={company.id} company={company} />
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}

/**
 * Super Admin platform dashboard. Owns the feature-scoped QueryClient, wraps
 * the view in a resilient error boundary, and composes the aggregation metrics
 * ribbon, the plan-distribution panel and the recent-companies feed — all fed
 * by the live `GET /dashboard/overview` endpoint.
 */
export default function SuperAdminDashboard(): JSX.Element {
    return (
        <QueryClientProvider client={queryClient}>
            <ErrorBoundary
                title="Platform dashboard unavailable"
                description="An unexpected error interrupted the platform overview. You can retry safely."
            >
                <PlatformOverview />
            </ErrorBoundary>
        </QueryClientProvider>
    );
}
