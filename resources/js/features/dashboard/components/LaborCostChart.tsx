import { AlertTriangle, LineChart } from 'lucide-react';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import { EmptyState } from '@/Components/common/EmptyState';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import {
    CHART_COLORS,
    CHART_HEIGHT,
    CHART_TOOLTIP_CLASS,
    formatAud,
    formatAudCompact,
} from '@/lib/chart';
import { cn } from '@/lib/utils';
import type { LaborCostPeriod, LaborCostPoint } from '@/types/analytics';

interface LaborCostChartProps {
    /** Ordered trend points (oldest → newest). */
    data: LaborCostPoint[];
    /** Granularity, used only for labelling. */
    period: LaborCostPeriod;
    /** Renders skeletons sized to the chart canvas. */
    isLoading?: boolean;
    /** Renders a structured error state with an optional retry. */
    isError?: boolean;
    /** Retry handler surfaced in the error state. */
    onRetry?: () => void;
    className?: string;
}

/** A single stat row inside the custom tooltip. */
function TooltipRow({
    color,
    label,
    value,
}: {
    color: string;
    label: string;
    value: string;
}): JSX.Element {
    return (
        <div className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                />
                {label}
            </span>
            <span className="font-medium text-popover-foreground">{value}</span>
        </div>
    );
}

/** Shape of the entries Recharts injects into a custom tooltip. */
interface LaborTooltipEntry {
    value?: number | string;
    name?: string;
    dataKey?: string | number;
    color?: string;
    payload?: LaborCostPoint;
}

interface LaborCostTooltipProps {
    active?: boolean;
    payload?: LaborTooltipEntry[];
    label?: string | number;
}

/** Design-system styled tooltip contrasting actual spend against budget. */
function LaborCostTooltip({ active, payload }: LaborCostTooltipProps): JSX.Element | null {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const point = payload[0]?.payload;
    if (!point) {
        return null;
    }

    const variance = point.budget - point.actualCost;
    const underBudget = variance >= 0;

    return (
        <div className={CHART_TOOLTIP_CLASS}>
            <p className="mb-1.5 font-semibold text-popover-foreground">{point.label}</p>
            <div className="space-y-1">
                <TooltipRow
                    color="var(--color-primary)"
                    label="Actual"
                    value={formatAud(point.actualCost)}
                />
                <TooltipRow
                    color="var(--color-info)"
                    label="Budget"
                    value={formatAud(point.budget)}
                />
            </div>
            <p
                className={cn(
                    'mt-1.5 border-t border-border pt-1.5 font-medium',
                    underBudget ? 'text-success' : 'text-danger',
                )}
            >
                {underBudget ? 'Under budget by ' : 'Over budget by '}
                {formatAud(Math.abs(variance))}
            </p>
        </div>
    );
}

/** Legend swatch shown in the card header. */
function LegendChip({
    color,
    label,
    dashed = false,
}: {
    color: string;
    label: string;
    dashed?: boolean;
}): JSX.Element {
    return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
                className={cn('h-0.5 w-4 rounded-full', dashed && 'opacity-80')}
                style={
                    dashed
                        ? {
                            backgroundImage: `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 8px)`,
                        }
                        : { backgroundColor: color }
                }
                aria-hidden="true"
            />
            {label}
        </span>
    );
}

/**
 * Labor Cost vs Budget trend. Pure presentational: it receives its series via
 * props and renders an area (actual) against a dashed budget line, with a
 * localized AUD tooltip. Colors reference semantic CSS variables so the chart
 * re-themes automatically in dark mode.
 */
export function LaborCostChart({
    data,
    period,
    isLoading = false,
    isError = false,
    onRetry,
    className,
}: LaborCostChartProps): JSX.Element {
    const totalActual = data.reduce((sum, point) => sum + point.actualCost, 0);
    const totalBudget = data.reduce((sum, point) => sum + point.budget, 0);
    const periodLabel = period === 'weekly' ? 'Last 12 weeks' : 'Last 6 months';

    return (
        <section
            className={cn('rounded-xl border border-border bg-card p-5 shadow-sm', className)}
            aria-label="Labor cost versus budget"
        >
            <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                        Labor Cost vs Budget
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {periodLabel}
                        {!isLoading && !isError && data.length > 0 && (
                            <>
                                {' · '}
                                <span className="font-medium text-foreground">
                                    {formatAud(totalActual)}
                                </span>{' '}
                                of {formatAud(totalBudget)}
                            </>
                        )}
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <LegendChip color="var(--color-primary)" label="Actual" />
                    <LegendChip color="var(--color-info)" label="Budget" dashed />
                </div>
            </header>

            {isLoading ? (
                <LoadingSkeleton className="h-72 w-full" label="Loading labor cost chart" />
            ) : isError ? (
                <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                            Unable to load labor cost
                        </p>
                        <p className="text-sm text-muted-foreground">
                            The trend data could not be retrieved.
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
                    icon={LineChart}
                    title="No labor cost history yet"
                    description="Once shifts are costed, weekly spending will appear here against your budget."
                    className="h-72 justify-center border-0 bg-transparent p-0"
                />
            ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                    <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <defs>
                            <linearGradient id="laborCostFill" x1="0" y1="0" x2="0" y2="1">
                                <stop
                                    offset="5%"
                                    stopColor="var(--color-primary)"
                                    stopOpacity={0.35}
                                />
                                <stop
                                    offset="95%"
                                    stopColor="var(--color-primary)"
                                    stopOpacity={0.02}
                                />
                            </linearGradient>
                        </defs>

                        <CartesianGrid
                            stroke={CHART_COLORS.grid}
                            strokeDasharray="4 4"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="label"
                            stroke={CHART_COLORS.axis}
                            tickLine={false}
                            axisLine={{ stroke: CHART_COLORS.grid }}
                            tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
                        />
                        <YAxis
                            width={64}
                            stroke={CHART_COLORS.axis}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
                            tickFormatter={(value: number) => formatAudCompact(value)}
                        />
                        <Tooltip
                            cursor={{ stroke: CHART_COLORS.cursor, strokeDasharray: '4 4' }}
                            content={<LaborCostTooltip />}
                        />
                        <Area
                            type="monotone"
                            dataKey="actualCost"
                            name="Actual"
                            stroke="var(--color-primary)"
                            strokeWidth={2}
                            fill="url(#laborCostFill)"
                            activeDot={{ r: 4 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="budget"
                            name="Budget"
                            stroke="var(--color-info)"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            )}
        </section>
    );
}
