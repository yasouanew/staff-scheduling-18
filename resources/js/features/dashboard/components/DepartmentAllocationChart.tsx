import { AlertTriangle, PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { EmptyState } from '@/Components/common/EmptyState';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import {
    CHART_HEIGHT,
    CHART_TOOLTIP_CLASS,
    chartToneToVar,
    formatPercent,
} from '@/lib/chart';
import { cn } from '@/lib/utils';
import type { DepartmentAllocationSlice } from '@/types/analytics';

interface DepartmentAllocationChartProps {
    /** One entry per department. */
    data: DepartmentAllocationSlice[];
    /** Total shift count across all slices (drives the center label + %). */
    totalShifts: number;
    isLoading?: boolean;
    isError?: boolean;
    onRetry?: () => void;
    className?: string;
}

/** Shape Recharts injects into the custom pie tooltip. */
interface DepartmentTooltipEntry {
    payload?: DepartmentAllocationSlice;
}

interface DepartmentTooltipProps {
    active?: boolean;
    payload?: DepartmentTooltipEntry[];
    totalShifts: number;
}

/** Design-system styled tooltip for a department slice. */
function DepartmentTooltip({ active, payload, totalShifts }: DepartmentTooltipProps): JSX.Element | null {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const slice = payload[0]?.payload;
    if (!slice) {
        return null;
    }

    const share = totalShifts > 0 ? (slice.shiftCount / totalShifts) * 100 : 0;

    return (
        <div className={CHART_TOOLTIP_CLASS}>
            <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-popover-foreground">
                <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: chartToneToVar(slice.tone) }}
                    aria-hidden="true"
                />
                {slice.department}
            </p>
            <div className="space-y-1">
                <div className="flex items-center justify-between gap-6">
                    <span className="text-muted-foreground">Shifts</span>
                    <span className="font-medium text-popover-foreground">
                        {slice.shiftCount} · {formatPercent(share)}
                    </span>
                </div>
            </div>
        </div>
    );
}

/** One row in the custom legend beneath the donut. */
function LegendRow({
    slice,
    totalShifts,
}: {
    slice: DepartmentAllocationSlice;
    totalShifts: number;
}): JSX.Element {
    const share = totalShifts > 0 ? (slice.shiftCount / totalShifts) * 100 : 0;

    return (
        <li className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
                <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: chartToneToVar(slice.tone) }}
                    aria-hidden="true"
                />
                <span className="truncate text-foreground">{slice.department}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
                {slice.shiftCount}
                <span className="ml-1 text-xs">({formatPercent(share)})</span>
            </span>
        </li>
    );
}

/**
 * Department shift-distribution donut. Pure presentational: it receives slices
 * via props and colors each segment from its semantic tone, so the palette
 * stays consistent and dark-mode aware. A center overlay surfaces the total.
 */
export function DepartmentAllocationChart({
    data,
    totalShifts,
    isLoading = false,
    isError = false,
    onRetry,
    className,
}: DepartmentAllocationChartProps): JSX.Element {
    return (
        <section
            className={cn('rounded-xl border border-border bg-card p-5 shadow-sm', className)}
            aria-label="Shift distribution by department"
        >
            <header className="mb-4 space-y-1">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                    Department Allocation
                </h2>
                <p className="text-sm text-muted-foreground">Shift distribution across departments</p>
            </header>

            {isLoading ? (
                <div className="flex flex-col items-center gap-4">
                    <LoadingSkeleton
                        className="h-48 w-48"
                        radius="full"
                        label="Loading department allocation chart"
                    />
                    <div className="w-full space-y-2">
                        <LoadingSkeleton className="h-4 w-full" radius="sm" />
                        <LoadingSkeleton className="h-4 w-4/5" radius="sm" />
                        <LoadingSkeleton className="h-4 w-3/5" radius="sm" />
                    </div>
                </div>
            ) : isError ? (
                <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                            Unable to load allocation
                        </p>
                        <p className="text-sm text-muted-foreground">
                            The distribution data could not be retrieved.
                        </p>
                    </div>
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Try again
                        </button>
                    )}
                </div>
            ) : data.length === 0 ? (
                <EmptyState
                    icon={PieChartIcon}
                    title="No shifts scheduled yet"
                    description="Assign shifts to departments and their distribution will appear here."
                    className="h-72 justify-center border-0 bg-transparent p-0"
                />
            ) : (
                <div className="space-y-5">
                    <div className="relative mx-auto" style={{ height: CHART_HEIGHT }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Tooltip
                                    cursor={false}
                                    content={<DepartmentTooltip totalShifts={totalShifts} />}
                                />
                                <Pie
                                    data={data}
                                    dataKey="shiftCount"
                                    nameKey="department"
                                    innerRadius="60%"
                                    outerRadius="85%"
                                    paddingAngle={2}
                                    cornerRadius={6}
                                    stroke="var(--color-card)"
                                    strokeWidth={2}
                                >
                                    {data.map((slice) => (
                                        <Cell key={slice.id} fill={chartToneToVar(slice.tone)} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>

                        {/* Center overlay: total shifts. Non-interactive so tooltips work. */}
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-semibold tracking-tight text-foreground">
                                {totalShifts}
                            </span>
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Total shifts
                            </span>
                        </div>
                    </div>

                    <ul className="space-y-2">
                        {data.map((slice) => (
                            <LegendRow key={slice.id} slice={slice} totalShifts={totalShifts} />
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
