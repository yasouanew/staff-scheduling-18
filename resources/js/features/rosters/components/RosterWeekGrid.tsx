import { CalendarOff, Clock, UserRound, UserRoundX } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ROSTER_SHIFT_STATUS_LABELS, type RosterShift } from '@/types/roster-management';

import {
    formatDayLabel,
    formatDayLabelLong,
    formatHours,
    formatShiftTimeRange,
    groupShiftsByDate,
    shiftPayableMinutes,
    toIsoDate,
    weekDays,
} from '../lib/roster-week';

interface RosterWeekGridProps {
    /** First day of the roster week (ISO `yyyy-MM-dd`). */
    weekStart: string | null;
    /** Shifts belonging to the roster. */
    shifts: RosterShift[];
    /** Renders skeleton columns while the parent query is loading. */
    isLoading?: boolean;
}

/** Semantic accent per shift status, used for the card's left border + text. */
const SHIFT_ACCENTS: Record<RosterShift['status'], string> = {
    open: 'border-l-warning',
    scheduled: 'border-l-primary',
    confirmed: 'border-l-success',
    completed: 'border-l-muted-foreground',
    cancelled: 'border-l-danger',
};

/** Single shift card inside a day column. */
function ShiftCard({ shift }: { shift: RosterShift }): JSX.Element {
    const isOpen = !shift.employeeId;

    return (
        <li
            className={cn(
                'rounded-lg border border-border border-l-4 bg-background p-3 shadow-sm transition-colors hover:bg-accent/40',
                SHIFT_ACCENTS[shift.status],
            )}
        >
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{formatShiftTimeRange(shift)}</span>
            </div>

            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                {isOpen ? (
                    <>
                        <UserRoundX className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                        <span className="font-medium text-warning">Unassigned</span>
                    </>
                ) : (
                    <>
                        <UserRound
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <span className="truncate text-muted-foreground">{shift.employeeName}</span>
                    </>
                )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">
                    {shift.positionName ?? ROSTER_SHIFT_STATUS_LABELS[shift.status]}
                </span>
                <span className="shrink-0 text-xs font-medium text-foreground">
                    {formatHours(shiftPayableMinutes(shift))}
                </span>
            </div>
        </li>
    );
}

/** Skeleton placeholder shown for each column while loading. */
function ColumnSkeleton(): JSX.Element {
    return (
        <div className="space-y-2" aria-hidden="true">
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
        </div>
    );
}

/**
 * Read-only weekly agenda for a roster.
 *
 * Renders seven day columns on desktop and stacks them into a vertical agenda on
 * mobile (the "calendar switches to agenda view" responsive rule). Purely
 * presentational: it derives its layout from the supplied `weekStart` and groups
 * the given shifts by date, with dedicated loading and per-day empty states.
 */
export function RosterWeekGrid({
    weekStart,
    shifts,
    isLoading = false,
}: RosterWeekGridProps): JSX.Element {
    const days = weekDays(weekStart);
    const grouped = groupShiftsByDate(shifts);

    return (
        <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-y-0 lg:grid-cols-4 xl:grid-cols-7 md:divide-x">
                {days.map((day) => {
                    const iso = toIsoDate(day);
                    const dayShifts = grouped.get(iso) ?? [];

                    return (
                        <section
                            key={iso}
                            aria-label={formatDayLabelLong(day)}
                            className="flex min-w-0 flex-col border-border md:border-b xl:border-b-0"
                        >
                            <header className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
                                <h3 className="text-sm font-semibold text-foreground">
                                    {formatDayLabel(day)}
                                </h3>
                                {dayShifts.length > 0 ? (
                                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                                        {dayShifts.length}
                                    </span>
                                ) : null}
                            </header>

                            <div className="flex-1 p-3">
                                {isLoading ? (
                                    <ColumnSkeleton />
                                ) : dayShifts.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center">
                                        <CalendarOff
                                            className="h-4 w-4 text-muted-foreground"
                                            aria-hidden="true"
                                        />
                                        <p className="text-xs text-muted-foreground">No shifts</p>
                                    </div>
                                ) : (
                                    <ul className="space-y-2">
                                        {dayShifts.map((shift) => (
                                            <ShiftCard key={shift.id} shift={shift} />
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
