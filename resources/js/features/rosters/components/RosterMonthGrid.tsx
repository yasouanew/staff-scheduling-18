import { cn } from '@/lib/utils';
import type { Shift } from '@/types/shift';

import {
    WEEKDAY_LABELS,
    type BranchDaySummary,
    type CalendarDay,
    type CalendarWeek,
    type CellContentMode,
} from '../lib/month-grid';

import { RosterMonthCell } from './RosterMonthCell';

interface RosterMonthGridProps {
    weeks: CalendarWeek[];
    /** `branches` for the month view, `shifts` for week/day. */
    contentMode: CellContentMode;
    showBranchNames: boolean;
    isPasteArmed: boolean;
    /** ISO dates currently multi-selected. */
    selectedDates: ReadonlySet<string>;
    /** ISO date the clipboard payload was copied from, if any. */
    copySourceDate: string | null;
    onAddShift: (date: string) => void;
    onCopy: (day: CalendarDay) => void;
    onPaste: (date: string) => void;
    onEditShift: (shift: Shift) => void;
    onDeleteShift: (shift: Shift) => void;
    onToggleSelect: (date: string, additive: boolean) => void;
    onViewDay: (date: string) => void;
    /** Opens a branch chip's roster in the Roster Details workspace. */
    onViewRoster: (rosterId: string) => void;
    /** Opens the branch-day editor from a branch chip. */
    onEditBranchDay: (summary: BranchDaySummary, date: string) => void;
    /** Requests deletion of every shift in a branch-day. */
    onDeleteBranchDay: (summary: BranchDaySummary, date: string) => void;
    /** Opens the ISO week as the week overview / roster detail. */
    onViewWeek: (weekStart: string) => void;
    /** Opens a day's full branch list from a cell's `+N more` control. */
    onViewAllBranches?: (day: CalendarDay) => void;


    onShiftDragStart?: (shift: Shift) => void;
    onShiftDragEnd?: () => void;
    onDropShift?: (date: string) => void;
}

/**
 * The month canvas: seven equal weekday columns × 5–6 week rows.
 *
 * The grid is exactly seven columns so every day cell lines up with its weekday
 * header and the first column starts flush against the card's left edge. The week
 * overview is reached from a week-number chip inside each Monday cell rather than
 * a dedicated gutter column, which previously consumed horizontal space in every
 * row without ever holding a date.
 *
 * Below `md` the 7-column grid is unreadable, so the same data renders as a
 * vertical agenda of days that actually have shifts.
 */
export function RosterMonthGrid({
    weeks,
    contentMode,
    showBranchNames,
    isPasteArmed,
    selectedDates,
    copySourceDate,
    onAddShift,
    onCopy,
    onPaste,
    onEditShift,
    onDeleteShift,
    onToggleSelect,
    onViewDay,
    onViewRoster,
    onEditBranchDay,
    onDeleteBranchDay,
    onViewWeek,
    onViewAllBranches,
    onShiftDragStart,

    onShiftDragEnd,
    onDropShift,
}: RosterMonthGridProps): JSX.Element {

    return (
        <>
            {/* Desktop / tablet: true month matrix */}
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
                {/* Weekday header — one column per weekday, aligned to the cells below. */}
                <div className="grid grid-cols-7 border-b border-border bg-secondary/50">
                    {WEEKDAY_LABELS.map((label) => (
                        <div
                            key={label}
                            className="border-r border-border px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
                        >
                            {label}
                        </div>
                    ))}
                </div>

                <div role="grid" aria-label="Roster month calendar">
                    {weeks.map((week) => (
                        <div key={week.weekStart} role="row" className="grid grid-cols-7">
                            {week.days.map((day, index) => (
                                <RosterMonthCell
                                    key={day.date}
                                    day={day}
                                    contentMode={contentMode}
                                    showBranchNames={showBranchNames}
                                    isPasteArmed={isPasteArmed}
                                    isSelected={selectedDates.has(day.date)}
                                    isCopySource={copySourceDate === day.date}
                                    // Only the row's first (Monday) cell carries the
                                    // week drill-down, so it reads as a row-level action.
                                    isoWeek={index === 0 ? week.isoWeek : null}
                                    weekShiftCount={week.shiftCount}
                                    onViewWeek={() => onViewWeek(week.weekStart)}
                                    onAddShift={onAddShift}
                                    onCopy={onCopy}
                                    onPaste={onPaste}
                                    onEditShift={onEditShift}
                                    onDeleteShift={onDeleteShift}
                                    onToggleSelect={onToggleSelect}
                                    onViewDay={onViewDay}
                                    onViewRoster={onViewRoster}
                                    onEditBranchDay={onEditBranchDay}
                                    onDeleteBranchDay={onDeleteBranchDay}
                                    onViewAllBranches={onViewAllBranches}
                                    onShiftDragStart={onShiftDragStart}


                                    onShiftDragEnd={onShiftDragEnd}
                                    onDropShift={onDropShift}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Mobile: agenda list (a 7-column grid is unusable under ~640px) */}
            <div className="space-y-4 md:hidden">
                {weeks.map((week) => {
                    const daysWithShifts = week.days.filter(
                        (day) => day.isCurrentPeriod && day.shifts.length > 0,
                    );

                    if (daysWithShifts.length === 0) return null;

                    return (
                        <section key={week.weekStart} className="space-y-2">
                            <button
                                type="button"
                                onClick={() => onViewWeek(week.weekStart)}
                                className="flex w-full items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Week {week.isoWeek} · {week.weekStart}
                                </span>
                                <span className="text-xs font-medium text-primary">
                                    {week.shiftCount} shifts
                                </span>
                            </button>

                            {daysWithShifts.map((day) => (
                                <article
                                    key={day.date}
                                    className={cn(
                                        'rounded-xl border border-border bg-card p-3 shadow-sm',
                                        day.isToday && 'border-primary',
                                    )}
                                >
                                    <RosterMonthCell
                                        day={day}
                                        contentMode={contentMode}
                                        showBranchNames={showBranchNames}
                                        isPasteArmed={isPasteArmed}
                                        isSelected={selectedDates.has(day.date)}
                                        isCopySource={copySourceDate === day.date}
                                        onAddShift={onAddShift}
                                        onCopy={onCopy}
                                        onPaste={onPaste}
                                        onEditShift={onEditShift}
                                        onDeleteShift={onDeleteShift}
                                        onToggleSelect={onToggleSelect}
                                        onViewDay={onViewDay}
                                        onViewRoster={onViewRoster}
                                        onEditBranchDay={onEditBranchDay}
                                        onDeleteBranchDay={onDeleteBranchDay}
                                        onViewAllBranches={onViewAllBranches}
                                    />


                                </article>
                            ))}
                        </section>
                    );
                })}
            </div>
        </>
    );
}
