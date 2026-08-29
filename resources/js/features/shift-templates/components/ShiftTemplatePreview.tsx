import { Clock, Coffee, MoonStar, Timer } from 'lucide-react';

import { cn } from '@/lib/utils';

import {
    buildTimelineSegments,
    computePaidMinutes,
    computeSpanMinutes,
    describeBreak,
    formatDuration,
    formatPaidHours,
    formatTimeRange,
    isOvernight,
    TIMELINE_TICKS,
} from '../lib/shift-time';

interface ShiftTemplatePreviewProps {
    /** Shift start in 24-hour `HH:mm`. */
    startTime: string;
    /** Shift end in 24-hour `HH:mm`. */
    endTime: string;
    /** Break duration in minutes. */
    breakMinutes: number;
    /** Whether the break is paid (affects payable hours). */
    isPaidBreak: boolean;
    /** Hex colour used to tint the timeline block. */
    color?: string | null;
    /** Optional extra classes for layout tweaks. */
    className?: string;
}

/** Single metric shown beneath the timeline track. */
interface MetricProps {
    icon: typeof Clock;
    label: string;
    value: string;
}

/** Compact icon + label + value trio used in the metrics row. */
function Metric({ icon: Icon, label, value }: MetricProps): JSX.Element {
    return (
        <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="truncate text-sm font-semibold text-foreground">{value}</p>
            </div>
        </div>
    );
}

/**
 * Live visual summary of a shift template's timing.
 *
 * Projects the shift onto a 24-hour track (splitting into two blocks when the
 * shift runs overnight) and surfaces the derived numbers a scheduler cares
 * about: total span, break configuration and payable hours. Purely
 * presentational — every value is computed by the pure helpers in
 * `lib/shift-time`, so this component can be reused by the form and by any
 * read-only summary.
 */
export function ShiftTemplatePreview({
    startTime,
    endTime,
    breakMinutes,
    isPaidBreak,
    color,
    className,
}: ShiftTemplatePreviewProps): JSX.Element {
    const spanMinutes = computeSpanMinutes(startTime, endTime);
    const paidMinutes = computePaidMinutes(spanMinutes, breakMinutes, isPaidBreak);
    const segments = buildTimelineSegments(startTime, endTime);
    const overnight = isOvernight(startTime, endTime);
    const hasValidSpan = !Number.isNaN(spanMinutes) && spanMinutes > 0;

    return (
        <section
            aria-label="Shift preview"
            className={cn('rounded-xl border border-border bg-muted/40 p-4', className)}
        >
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span
                        className="h-3 w-3 shrink-0 rounded-full ring-2 ring-background"
                        style={{ backgroundColor: color ?? undefined }}
                        aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-foreground">
                        {hasValidSpan ? formatTimeRange(startTime, endTime) : 'Set a start and end time'}
                    </p>
                </div>
                {overnight ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-info/10 px-2.5 py-1 text-xs font-medium text-info">
                        <MoonStar className="h-3.5 w-3.5" aria-hidden="true" />
                        Overnight
                    </span>
                ) : null}
            </header>

            {/* 24-hour track */}
            <div className="mt-4">
                <div
                    className="relative h-8 w-full overflow-hidden rounded-lg bg-background ring-1 ring-inset ring-border"
                    role="img"
                    aria-label={
                        hasValidSpan
                            ? `Shift from ${formatTimeRange(startTime, endTime)}, ${formatDuration(spanMinutes)} long`
                            : 'No shift times selected'
                    }
                >
                    {segments.map((segment, index) => (
                        <span
                            key={`${segment.leftPercent}-${index}`}
                            className="absolute inset-y-1 rounded-md"
                            style={{
                                left: `${segment.leftPercent}%`,
                                width: `${segment.widthPercent}%`,
                                backgroundColor: color ?? undefined,
                            }}
                            aria-hidden="true"
                        />
                    ))}
                    {!hasValidSpan ? (
                        <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                            No shift selected
                        </span>
                    ) : null}
                </div>
                <div className="relative mt-1 h-4">
                    {TIMELINE_TICKS.map((tick, index) => (
                        <span
                            key={`${tick.label}-${index}`}
                            className={cn(
                                'absolute text-[10px] tabular-nums text-muted-foreground',
                                tick.percent === 0 && 'translate-x-0',
                                tick.percent === 100 && '-translate-x-full',
                                tick.percent > 0 && tick.percent < 100 && '-translate-x-1/2',
                            )}
                            style={{ left: `${tick.percent}%` }}
                            aria-hidden="true"
                        >
                            {tick.label}
                        </span>
                    ))}
                </div>
            </div>

            {/* Derived metrics */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Metric
                    icon={Clock}
                    label="Shift length"
                    value={hasValidSpan ? formatDuration(spanMinutes) : '—'}
                />
                <Metric icon={Coffee} label="Break" value={describeBreak(breakMinutes, isPaidBreak)} />
                <Metric
                    icon={Timer}
                    label="Payable hours"
                    value={hasValidSpan ? formatPaidHours(paidMinutes) : '—'}
                />
            </div>
        </section>
    );
}
