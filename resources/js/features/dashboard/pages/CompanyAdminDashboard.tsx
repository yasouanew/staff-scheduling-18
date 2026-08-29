import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
    Activity,
    AlertTriangle,
    Building2,
    CalendarDays,
    CheckCircle2,
    Clock,
    CreditCard,
    DollarSign,
    FileText,
    Inbox,
    TrendingDown,
    TrendingUp,
    UserPlus,
    type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/Components/common/EmptyState';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { StatCard, type StatCardTone } from '@/Components/common/StatCard';
import { BranchUsageCard } from '@/features/billing/components/BranchUsageCard';
import { useUsageOverview } from '@/features/billing/hooks/useSubscription';
import { formatAud, formatHours } from '@/lib/chart';
import { cn } from '@/lib/utils';
import type { ActivityItem, ActivityType, LaborCostPeriod } from '@/types/analytics';

import { DepartmentAllocationChart } from '../components/DepartmentAllocationChart';
import { LaborCostChart } from '../components/LaborCostChart';
import { useDashboardAnalytics } from '../hooks/useDashboardAnalytics';

/** Dedicated client so the dashboard works standalone without global setup. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Selectable trend granularities for the period toggle. */
const PERIODS: readonly LaborCostPeriod[] = ['weekly', 'monthly'];

/** Icon + tone treatment per activity category. */
const ACTIVITY_META: Record<ActivityType, { icon: LucideIcon; tone: StatCardTone }> = {
    shift_published: { icon: CalendarDays, tone: 'info' },
    leave_requested: { icon: Clock, tone: 'warning' },
    employee_joined: { icon: UserPlus, tone: 'success' },
    roster_updated: { icon: FileText, tone: 'primary' },
    timesheet_approved: { icon: CheckCircle2, tone: 'success' },
};

/** Soft-background + foreground token pair per tone (mirrors StatCard). */
const TONE_CHIP: Record<StatCardTone, string> = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
    info: 'bg-info/10 text-info',
};

/** A single entry in the Recent Activity feed. */
function ActivityRow({ item }: { item: ActivityItem }): JSX.Element {
    const { icon: Icon, tone } = ACTIVITY_META[item.type];

    return (
        <li className="flex items-start gap-3 py-3">
            <span
                className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    TONE_CHIP[tone],
                )}
            >
                <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="truncate text-sm text-muted-foreground">{item.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.actor} ·{' '}
                    {formatDistanceToNow(parseISO(item.timestamp), { addSuffix: true })}
                </p>
            </div>
        </li>
    );
}

/** Recent Activity panel with its own loading / empty / error states. */
function RecentActivityPanel({
    items,
    isLoading,
    isError,
    onRetry,
}: {
    items: ActivityItem[];
    isLoading: boolean;
    isError: boolean;
    onRetry: () => void;
}): JSX.Element {
    return (
        <section
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
            aria-label="Recent activity"
        >
            <header className="mb-2 flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                    Recent Activity
                </h2>
            </header>

            {isLoading ? (
                <div className="space-y-4 py-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="flex items-center gap-3">
                            <LoadingSkeleton className="h-9 w-9" radius="md" />
                            <div className="flex-1 space-y-2">
                                <LoadingSkeleton className="h-3.5 w-2/5" radius="sm" />
                                <LoadingSkeleton className="h-3 w-3/5" radius="sm" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : isError ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <p className="text-sm text-muted-foreground">Couldn’t load recent activity.</p>
                    <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Try again
                    </button>
                </div>
            ) : items.length === 0 ? (
                <EmptyState
                    icon={Inbox}
                    title="No recent activity"
                    description="Roster changes, leave requests and approvals will show up here."
                    className="border-0 bg-transparent p-6"
                />
            ) : (
                <ul className="divide-y divide-border">
                    {items.map((item) => (
                        <ActivityRow key={item.id} item={item} />
                    ))}
                </ul>
            )}
        </section>
    );
}

/** Inner dashboard view (relies on an ancestor QueryClientProvider). */
function DashboardContent(): JSX.Element {
    const [period, setPeriod] = useState<LaborCostPeriod>('weekly');
    const { data, isLoading, isError, refetch } = useDashboardAnalytics({ period });
    const usageQuery = useUsageOverview();

    const retry = (): void => {
        void refetch();
    };

    const laborActual = data?.laborCost.totalActual ?? 0;
    const laborBudget = data?.laborCost.totalBudget ?? 0;
    const variance = laborBudget - laborActual;
    const underBudget = variance >= 0;
    const avgHours = data?.scheduledHours.averageScheduled ?? 0;
    const totalShifts = data?.departmentAllocation.totalShifts ?? 0;
    const periodLabel = period === 'weekly' ? 'Last 12 weeks' : 'Last 6 months';

    const branchUsage = usageQuery.data?.branchesUsage ?? [];
    const branchLimit = usageQuery.data?.branches.limit ?? null;
    const branchUsed = usageQuery.data?.branches.used ?? 0;
    const branchLimitReached = branchLimit !== null && branchUsed >= branchLimit;

    return (
        <div className="space-y-6">
            {/* Page header + period toggle */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Dashboard
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Labor spend, scheduling trends and team activity at a glance.
                    </p>
                </div>

                <div
                    role="group"
                    aria-label="Trend period"
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1"
                >
                    {PERIODS.map((option) => (
                        <button
                            key={option}
                            type="button"
                            aria-pressed={period === option}
                            onClick={() => setPeriod(option)}
                            className={cn(
                                'h-8 rounded-md px-3 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                period === option
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI summary row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Labor Cost"
                    value={formatAud(laborActual)}
                    icon={DollarSign}
                    tone="primary"
                    description={periodLabel}
                    isLoading={isLoading}
                />
                <StatCard
                    title="Budget Variance"
                    value={formatAud(Math.abs(variance))}
                    icon={underBudget ? TrendingDown : TrendingUp}
                    tone={underBudget ? 'success' : 'danger'}
                    description={underBudget ? 'Under budget' : 'Over budget'}
                    isLoading={isLoading}
                />
                <StatCard
                    title="Avg Weekly Hours"
                    value={formatHours(avgHours)}
                    icon={Clock}
                    tone="info"
                    description="Scheduled per week"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Total Shifts"
                    value={totalShifts}
                    icon={CalendarDays}
                    tone="warning"
                    description="Across departments"
                    isLoading={isLoading}
                />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <LaborCostChart
                    data={data?.laborCost.points ?? []}
                    period={period}
                    isLoading={isLoading}
                    isError={isError}
                    onRetry={retry}
                    className="lg:col-span-2"
                />
                <DepartmentAllocationChart
                    data={data?.departmentAllocation.slices ?? []}
                    totalShifts={totalShifts}
                    isLoading={isLoading}
                    isError={isError}
                    onRetry={retry}
                />
            </div>

            {/* Subscription & usage */}
            <section
                className="rounded-xl border border-border bg-card p-5 shadow-sm"
                aria-label="Subscription and usage"
            >
                <header className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <h2 className="text-base font-semibold tracking-tight text-foreground">
                            Subscription & Usage
                        </h2>
                    </div>
                    <Link
                        to="/subscription"
                        className="inline-flex h-8 items-center justify-center rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Manage subscription
                    </Link>
                </header>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        title="Active Branches"
                        value={branchLimit === null ? branchUsed : `${branchUsed} / ${branchLimit}`}
                        icon={Building2}
                        tone="primary"
                        description={branchLimit === null ? 'Unlimited plan allowance' : 'Branch allowance used'}
                        isLoading={usageQuery.isLoading}
                    />
                    <StatCard
                        title="Entitled Employees"
                        value={branchUsage.reduce((sum, branch) => sum + branch.employeesUsed, 0)}
                        icon={UserPlus}
                        tone="success"
                        description="Across active branches"
                        isLoading={usageQuery.isLoading}
                    />
                </div>

                {branchUsage.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {branchUsage.slice(0, 4).map((branch) => (
                            <BranchUsageCard
                                key={branch.id}
                                branch={branch}
                                suggestedMax={null}
                                canManage={false}
                                branchLimitReached={branchLimitReached}
                                isActivating={false}
                                onActivate={() => undefined}
                                onIncreaseCapacity={() => undefined}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Recent activity */}
            <RecentActivityPanel
                items={data?.recentActivity ?? []}
                isLoading={isLoading}
                isError={isError}
                onRetry={retry}
            />
        </div>
    );
}

/**
 * Company Admin dashboard. Owns the feature-scoped QueryClient and the period
 * toggle, then composes the KPI StatCards, the labor-cost and department
 * allocation charts, and the recent-activity feed. All data flows through the
 * isolated {@link useDashboardAnalytics} hook, keeping the charts presentational.
 */
export default function CompanyAdminDashboard(): JSX.Element {
    return (
        <QueryClientProvider client={queryClient}>
            <DashboardContent />
        </QueryClientProvider>
    );
}
