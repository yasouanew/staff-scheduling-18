import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

import { formatPeriodLabel, type CalendarViewMode } from '../lib/month-grid';

/** Selectable granularities, ordered widest-first as they appear in the control. */
const VIEW_MODES: readonly { value: CalendarViewMode; label: string }[] = [
    { value: 'month', label: 'Month' },
    { value: 'week', label: 'Week' },
    { value: 'day', label: 'Day' },
] as const;

interface CalendarToolbarProps {
    /** Any date inside the displayed period. */
    cursor: Date;
    /** Active granularity. */
    view: CalendarViewMode;
    /** Steps the cursor one period back. */
    onPrevious: () => void;
    /** Steps the cursor one period forward. */
    onNext: () => void;
    /** Resets the cursor to today. */
    onToday: () => void;
    /** Switches granularity. */
    onViewChange: (view: CalendarViewMode) => void;
    /** Disables navigation while a range is being fetched. */
    isLoading?: boolean;
}

/**
 * Calendar navigation bar: period stepper on the left, the current period label
 * in the centre, and the Month/Week/Day switcher on the right.
 *
 * The label is an `aria-live` region so screen-reader users hear the new period
 * after using the arrows, which would otherwise be a silent change.
 */
export function CalendarToolbar({
    cursor,
    view,
    onPrevious,
    onNext,
    onToday,
    onViewChange,
    isLoading = false,
}: CalendarToolbarProps): JSX.Element {
    const stepLabel = view === 'month' ? 'month' : view === 'week' ? 'week' : 'day';

    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: period stepper */}
            <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-input bg-card shadow-sm">
                    <button
                        type="button"
                        onClick={onPrevious}
                        disabled={isLoading}
                        aria-label={`Previous ${stepLabel}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="h-9 w-px bg-border" aria-hidden="true" />
                    <button
                        type="button"
                        onClick={onNext}
                        disabled={isLoading}
                        aria-label={`Next ${stepLabel}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                <button
                    type="button"
                    onClick={onToday}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Today
                </button>
            </div>

            {/* Centre: current period */}
            <p
                aria-live="polite"
                className="order-first text-lg font-semibold tracking-tight text-foreground sm:order-none"
            >
                {formatPeriodLabel(cursor, view)}
            </p>

            {/* Right: granularity switcher */}
            <div
                role="group"
                aria-label="Calendar view"
                className="inline-flex items-center gap-1 rounded-lg border border-input bg-secondary/50 p-1"
            >
                {VIEW_MODES.map((mode) => {
                    const isActive = mode.value === view;

                    return (
                        <button
                            key={mode.value}
                            type="button"
                            onClick={() => onViewChange(mode.value)}
                            aria-pressed={isActive}
                            className={cn(
                                'inline-flex h-7 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                isActive
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {mode.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
