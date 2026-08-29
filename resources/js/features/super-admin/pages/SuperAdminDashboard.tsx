import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    AlertTriangle,
    Building2,
    DollarSign,
    ShieldCheck,
    TrendingDown,
    TrendingUp,
    Users,
} from 'lucide-react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import { EmptyState } from '@/Components/common/EmptyState';
import { ErrorBoundary } from '@/Components/common/ErrorBoundary';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { StatCard, type StatCardTone } from '@/Components/common/StatCard';
import { formatAud } from '@/lib/chart';
import { cn } from '@/lib/utils';
import type {
    DistributionTone,
    PlanDistributionSlice,
    RevenuePoint,
    SystemHealth,
} from '@/types/super-admin';

import { usePlatformMetrics } from '../hooks/useSuperAdmin';

/** Dedicated client so the platform dashboard works standalone. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Fixed chart height keeps the revenue panel visually balanced. */
const CHART_HEIGHT = 288;

/** Presentational label + tone treatment per system-health state. */
const HEALTH_META: Record<SystemHealth, { label: string; tone: StatCardTone }> = {
    operational: { label: 'Operational', tone: 'success' },
    degraded: { label: 'Degraded', tone: 'warning' },
    maintenance: { label: 'Maintenance', tone: 'info' },
};

/** Semantic bar/text token pairs for the plan distribution rows. */
const TONE_BAR: Record<DistributionTone, string> = {
    primary: 'bg-primary',
    success: 'bg-success',
    info: 'bg-info',
    warning: 'bg-warning',
};

/** Compact AUD axis formatter (e.g. `$12k`). */
function formatAudAxis(value: number): string {
    if (Math.abs(value) >= 1000) {
        return `$${Math.round(value / 1000)}k`;
    }
    return `$${value}`;
}

/** Tooltip payload shape injected by Recharts for the revenue area. */
interface RevenueTooltipProps {
    active?: boolean;
    payload?: ReadonlyArray<{ payload: RevenuePoint }>;
}

/** Custom AUD tooltip surfacing MRR and annualised run-rate. */
function RevenueTooltip({ active, payload }: RevenueTooltipProps): JSX.Element | null {
    if (!active || !payload || payload.length === 0) {
        return null;
    }
    const point = payload[0].payload;
    return (
        <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
            <p className="mb-1 font-semibold text-popover-foreground">{point.label}</p>
            <p className="text-muted-foreground">
                MRR <span className="font-medium text-foreground">{formatAud(point.mrr)}</span>
            </p>
            <p className="text-muted-foreground">
                ARR <span className="font-medium text-foreground">{formatAud(point.arr)}</span>
            </p>
        </div>
    );
}

/** Presentational recurring-revenue trend chart (props only, no fetching). */
function PlatformRevenueChart({ data }: { data: RevenuePoint[] }): JSX.Element {
    return (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                    <linearGradient id="platform-mrr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                    tickFormatter={formatAudAxis}
                />
                <Tooltip content={<RevenueTooltip />} cursor={{ stroke: 'var(--color-border)' }} />
                <Area
                    type="monotone"
                    dataKey="mrr"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    fill="url(#platform-mrr)"
                />
            </AreaChart>
        </ResponsiveContainer>
    );
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

/** Inner dashboard view (relies on an ancestor QueryClientProvider). */
function PlatformOverview(): JSX.Element {
    const { data, isLoading, isError, refetch } = usePlatformMetrics();

    const health = HEALTH_META[data?.systemHealth ?? 'operational'];
    const growth = data?.revenue.growthRatePct ?? 0;
    const growthPositive = growth >= 0;

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Platform Overview
                </h1>
                <p className="text-sm text-muted-foreground">
                    Cross-tenant revenue, adoption and system health across the platform.
                </p>
            </div>

            {/* Aggregation metrics ribbon */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Monthly Recurring Revenue"
                    value={formatAud(data?.revenue.mrr ?? 0)}
                    icon={DollarSign}
                    tone="primary"
                    description={`ARR ${formatAud(data?.revenue.arr ?? 0)}`}
                    isLoading={isLoading}
                />
                <StatCard
                    title="Active Tenants"
                    value={data?.activeTenants ?? 0}
                    icon={Building2}
                    tone="info"
                    description={`${data?.totalTenants ?? 0} total · ${data?.suspendedTenants ?? 0} suspended`}
                    isLoading={isLoading}
                />
                <StatCard
                    title="Employees Scheduled"
                    value={(data?.employeesScheduled ?? 0).toLocaleString('en-AU')}
                    icon={Users}
                    tone="success"
                    description="Across Australia"
                    isLoading={isLoading}
                />
                <StatCard
                    title="System Health"
                    value={health.label}
                    icon={ShieldCheck}
                    tone={health.tone}
                    description={`MoM ${growthPositive ? '+' : ''}${growth}%`}
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
                    {/* Revenue trend */}
                    <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
                        <header className="mb-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-semibold tracking-tight text-foreground">
                                    Recurring Revenue
                                </h2>
                                <p className="text-sm text-muted-foreground">Last 12 months (AUD)</p>
                            </div>
                            <span
                                className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                                    growthPositive
                                        ? 'bg-success/10 text-success'
                                        : 'bg-danger/10 text-danger',
                                )}
                            >
                                {growthPositive ? (
                                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                                ) : (
                                    <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                {growthPositive ? '+' : ''}
                                {growth}%
                            </span>
                        </header>

                        {isLoading ? (
                            <LoadingSkeleton className="h-72 w-full" radius="lg" />
                        ) : (
                            <PlatformRevenueChart data={data?.revenue.trend ?? []} />
                        )}
                    </section>

                    {/* Plan distribution */}
                    <section
                        className="rounded-xl border border-border bg-card p-5 shadow-sm"
                        aria-label="Plan distribution"
                    >
                        <header className="mb-4">
                            <h2 className="text-base font-semibold tracking-tight text-foreground">
                                Plan Distribution
                            </h2>
                            <p className="text-sm text-muted-foreground">Tenants by subscription tier</p>
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
                        ) : (data?.planDistribution.length ?? 0) === 0 ? (
                            <EmptyState
                                title="No tenants yet"
                                description="Tenant plan adoption will appear here."
                                className="border-0 bg-transparent p-6"
                            />
                        ) : (
                            <ul className="space-y-4">
                                {data?.planDistribution.map((slice) => (
                                    <DistributionRow key={slice.tier} slice={slice} />
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
 * ribbon, the recurring-revenue trend chart and the plan-distribution panel.
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
