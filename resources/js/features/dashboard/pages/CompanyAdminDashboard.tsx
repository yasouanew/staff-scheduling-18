import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
    Building2,
    CalendarDays,
    ClipboardList,
    CreditCard,
    Layers,
    UserCheck,
    Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { StatCard } from '@/Components/common/StatCard';
import { BranchUsageCard } from '@/features/billing/components/BranchUsageCard';
import { useUsageOverview } from '@/features/billing/hooks/useSubscription';

import { DepartmentAllocationChart } from '../components/DepartmentAllocationChart';
import { useCompanyDashboardOverview } from '../hooks/useDashboardAnalytics';

/** Dedicated client so the dashboard works standalone without global setup. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Format an ISO date as a compact weekday label, e.g. "Mon 24 Aug". */
function formatWeekDay(value: string): string {
    return format(parseISO(value), 'EEE d MMM');
}

/** A single row in the "This week" summary panel. */
function WeekRow({ label, value }: { label: string; value: string | number }): JSX.Element {
    return (
        <div className="flex items-center justify-between py-3">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium tabular-nums text-foreground">{value}</dd>
        </div>
    );
}

/** Inner dashboard view (relies on an ancestor QueryClientProvider). */
function DashboardContent(): JSX.Element {
    const { data, isLoading, isError, refetch } = useCompanyDashboardOverview();
    const usageQuery = useUsageOverview();

    const retry = (): void => {
        void refetch();
    };

    const stats = data?.stats;
    const allocation = data?.departmentAllocation;
    const totalShifts = allocation?.totalShifts ?? 0;

    const branchUsage = usageQuery.data?.branchesUsage ?? [];
    const branchLimit = usageQuery.data?.branches.limit ?? null;
    const branchUsed = usageQuery.data?.branches.used ?? 0;
    const branchLimitReached = branchLimit !== null && branchUsed >= branchLimit;

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Dashboard
                </h1>
                <p className="text-sm text-muted-foreground">
                    Your workforce and scheduling operations at a glance.
                </p>
            </div>

            {/* Workforce + structure KPIs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Employees"
                    value={stats?.totalEmployees ?? 0}
                    icon={Users}
                    tone="primary"
                    description="Across all branches"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Active Employees"
                    value={stats?.activeEmployees ?? 0}
                    icon={UserCheck}
                    tone="success"
                    description="Currently active"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Branches"
                    value={stats?.totalBranches ?? 0}
                    icon={Building2}
                    tone="info"
                    description="Company locations"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Departments"
                    value={stats?.totalDepartments ?? 0}
                    icon={Layers}
                    tone="warning"
                    description="Across the company"
                    isLoading={isLoading}
                />
            </div>

            {/* Charts + this-week summary */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <DepartmentAllocationChart
                    data={allocation?.slices ?? []}
                    totalShifts={totalShifts}
                    isLoading={isLoading}
                    isError={isError}
                    onRetry={retry}
                    className="lg:col-span-2"
                />

                <section
                    className="rounded-xl border border-border bg-card p-5 shadow-sm"
                    aria-label="This week summary"
                >
                    <header className="mb-2 flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <h2 className="text-base font-semibold tracking-tight text-foreground">
                            This Week
                        </h2>
                    </header>

                    {isLoading ? (
                        <div className="space-y-3 pt-2">
                            <LoadingSkeleton className="h-14 w-full" radius="md" />
                            <LoadingSkeleton className="h-14 w-full" radius="md" />
                            <LoadingSkeleton className="h-14 w-full" radius="md" />
                        </div>
                    ) : isError ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                                <CalendarDays className="h-6 w-6" aria-hidden="true" />
                            </span>
                            <p className="text-sm text-muted-foreground">
                                Couldn’t load this week’s totals.
                            </p>
                            <button
                                type="button"
                                onClick={retry}
                                className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                Try again
                            </button>
                        </div>
                    ) : (
                        <dl className="divide-y divide-border">
                            <WeekRow
                                label="Week range"
                                value={
                                    data?.week
                                        ? `${formatWeekDay(data.week.start)} – ${formatWeekDay(data.week.end)}`
                                        : '—'
                                }
                            />
                            <WeekRow label="Shifts scheduled" value={stats?.shiftsThisWeek ?? 0} />
                            <WeekRow label="Pending leave" value={stats?.pendingLeaveRequests ?? 0} />
                            <WeekRow label="Published rosters" value={stats?.publishedRosters ?? 0} />
                        </dl>
                    )}
                </section>
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
                        icon={UserCheck}
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
        </div>
    );
}

/**
 * Company Admin dashboard. Owns the feature-scoped QueryClient and composes
 * the real operational KPIs, the department-allocation donut and the
 * subscription usage snapshot. All data flows through the isolated
 * {@link useCompanyDashboardOverview} hook, keeping the charts presentational.
 */
export default function CompanyAdminDashboard(): JSX.Element {
    return (
        <QueryClientProvider client={queryClient}>
            <DashboardContent />
        </QueryClientProvider>
    );
}
