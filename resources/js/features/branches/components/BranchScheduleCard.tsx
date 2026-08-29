import { CalendarClock, Coffee, Moon, Pencil, Sunrise } from 'lucide-react';

import { cn } from '@/lib/utils';
import { WEEKDAYS, WEEKDAY_LABELS, type Branch, type DaySchedule, type Weekday } from '@/types/branch';

import {
    countCustomDays,
    currentWeekdayFor,
    formatBreak,
    formatTradingWindow,
    isOvernight,
    paidHoursForDay,
    paidHoursForWeek,
} from '../lib/format-schedule';

/**
 * Read-only view of a branch's trading hours and break policy.
 *
 * Purely presentational: it receives a resolved {@link Branch} and raises an
 * edit request, so the detail page keeps ownership of data fetching and modals.
 *
 * The panel leads with the standard day, then lists all seven weekdays with the
 * defaults already applied. Showing every day — rather than only the exceptions
 * — means "what happens on Sunday?" is answered by reading, never by inferring.
 */

/** One weekday row in the week list. */
function ScheduleRow({
    weekday,
    day,
    isToday,
}: {
    weekday: Weekday;
    day: DaySchedule;
    isToday: boolean;
}): JSX.Element {
    const window = formatTradingWindow(day.opensAt, day.closesAt);
    const breakLabel = formatBreak(day.breakMinutes, day.breakPaid);
    const paidHours = paidHoursForDay(day);
    const overnight = day.isOpen && isOvernight(day.opensAt, day.closesAt);

    return (
        <div
            className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 transition-colors sm:flex-nowrap',
                isToday ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : 'hover:bg-accent/50',
            )}
        >
            {/* Day name — fixed width so every time column lines up. */}
            <div className="flex w-full items-center gap-2 sm:w-32 sm:shrink-0">
                <span
                    className={cn(
                        'text-sm',
                        isToday ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                    )}
                >
                    {WEEKDAY_LABELS[weekday]}
                </span>
                {isToday && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Today
                    </span>
                )}
            </div>

            {/* Hours */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                {!day.isOpen ? (
                    <span className="text-sm text-muted-foreground">Closed</span>
                ) : window ? (
                    <>
                        <span className="text-sm tabular-nums text-foreground">{window}</span>
                        {overnight && (
                            <span
                                className="inline-flex items-center gap-1 rounded-full bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info"
                                title="This day closes after midnight"
                            >
                                <Moon className="h-3 w-3" aria-hidden="true" />
                                Overnight
                            </span>
                        )}
                    </>
                ) : (
                    <span className="text-sm text-muted-foreground">Hours not set</span>
                )}

                {day.isOpen && breakLabel && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Coffee className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {breakLabel}
                    </span>
                )}
            </div>

            {/* Paid hours + whether the day is an exception. */}
            <div className="flex shrink-0 items-center gap-2">
                {day.isCustom && (
                    <span
                        className="rounded-full border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning"
                        title="This day differs from the standard hours"
                    >
                        Exception
                    </span>
                )}
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                    {paidHours === null ? '—' : `${paidHours} h`}
                </span>
            </div>
        </div>
    );
}

/** Headline summary of the branch's standard day. */
function StandardDaySummary({ branch }: { branch: Branch }): JSX.Element {
    const window = formatTradingWindow(branch.defaultOpensAt, branch.defaultClosesAt);
    const breakLabel = formatBreak(branch.defaultBreakMinutes, branch.defaultBreakPaid);
    const overnight = isOvernight(branch.defaultOpensAt, branch.defaultClosesAt);

    return (
        <div className="grid gap-4 rounded-lg border border-border bg-accent/30 p-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground">
                    <Sunrise className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Standard day</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                        {window ?? 'Not set'}
                        {overnight && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info">
                                <Moon className="h-3 w-3" aria-hidden="true" />
                                Overnight
                            </span>
                        )}
                    </p>
                </div>
            </div>

            <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground">
                    <Coffee className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Standard break</p>
                    <p className="text-sm font-medium text-foreground">{breakLabel ?? 'Not set'}</p>
                </div>
            </div>
        </div>
    );
}

/**
 * Empty state shown when a branch has no hours configured at all.
 *
 * Rendered instead of seven "Hours not set" rows, which would look like a
 * failure rather than an unfinished setup step.
 */
function ScheduleEmptyState({ onEdit }: { onEdit: () => void }): JSX.Element {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-muted-foreground">
                <CalendarClock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">No operating hours set</p>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                    Add the hours this branch trades so rosters can warn you when a shift falls
                    outside them.
                </p>
            </div>
            <button
                type="button"
                onClick={onEdit}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Set operating hours
            </button>
        </div>
    );
}

/** Props for {@link BranchScheduleCard}. */
export interface BranchScheduleCardProps {
    /** The branch whose schedule is displayed. */
    branch: Branch;
    /** Opens the branch edit form, focused on hours. */
    onEdit: () => void;
}

/**
 * Card showing a branch's operating hours, breaks and weekly exceptions.
 */
export function BranchScheduleCard({ branch, onEdit }: BranchScheduleCardProps): JSX.Element {
    const today = currentWeekdayFor(branch.timezone);
    const customDays = countCustomDays(branch.daySchedules);
    const weeklyHours = paidHoursForWeek(branch.daySchedules);

    // "Configured" means at least one day trades with real hours — a branch with
    // no defaults and no exceptions has nothing worth tabulating.
    const hasSchedule =
        Boolean(branch.defaultOpensAt && branch.defaultClosesAt) ||
        WEEKDAYS.some((weekday) => {
            const day = branch.daySchedules[weekday];
            return day.isCustom && (!day.isOpen || Boolean(day.opensAt && day.closesAt));
        });

    return (
        <section
            aria-labelledby="branch-hours-heading"
            className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h2 id="branch-hours-heading" className="text-base font-semibold text-foreground">
                        Operating hours
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {hasSchedule
                            ? customDays === 0
                                ? 'Every day follows the standard hours.'
                                : `${customDays} ${customDays === 1 ? 'day differs' : 'days differ'} from the standard hours.`
                            : 'Not configured yet.'}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onEdit}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit hours
                </button>
            </div>

            {!hasSchedule ? (
                <ScheduleEmptyState onEdit={onEdit} />
            ) : (
                <>
                    <StandardDaySummary branch={branch} />

                    <div className="space-y-1">
                        {/* Column headers, hidden on mobile where rows stack. */}
                        <div className="hidden items-center gap-3 px-3 pb-1 sm:flex">
                            <span className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Day
                            </span>
                            <span className="flex-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Hours
                            </span>
                            <span className="w-16 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Paid
                            </span>
                        </div>

                        <div className="divide-y divide-border/60">
                            {WEEKDAYS.map((weekday) => (
                                <ScheduleRow
                                    key={weekday}
                                    weekday={weekday}
                                    day={branch.daySchedules[weekday]}
                                    isToday={weekday === today}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                        <p className="text-sm text-muted-foreground">
                            Total paid hours per week
                            {/* Named so nobody reads this as including unpaid breaks. */}
                            <span className="block text-xs">Unpaid breaks excluded</span>
                        </p>
                        <p className="text-lg font-semibold tabular-nums text-foreground">
                            {weeklyHours} h
                        </p>
                    </div>
                </>
            )}
        </section>
    );
}

export default BranchScheduleCard;
