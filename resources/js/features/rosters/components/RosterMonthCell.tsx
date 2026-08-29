import { CalendarRange, ClipboardPaste, Copy, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Shift } from '@/types/shift';

import type { BranchDaySummary, CalendarDay, CellContentMode } from '../lib/month-grid';

import { BranchDayChip } from './BranchDayChip';
import { ShiftChip } from './ShiftChip';

/** Chips rendered before the cell collapses the remainder into `+N more`. */
const MAX_VISIBLE_CHIPS = 3;

interface RosterMonthCellProps {
    day: CalendarDay;
    /**
     * `branches` aggregates the day to one chip per branch (month view), while
     * `shifts` renders each shift individually (week/day views).
     */
    contentMode: CellContentMode;
    /**
     * ISO week number when this cell owns the row's week drill-down (the Monday
     * cell in the month grid), otherwise `null`.
     */
    isoWeek?: number | null;
    /** Total shifts in the owning week, surfaced on the drill-down control. */
    weekShiftCount?: number;
    /** Opens the owning ISO week as the week overview. */
    onViewWeek?: () => void;
    /** True while the "All branches" filter is active. */
    showBranchNames: boolean;
    /** True when a copied payload is available, which arms the paste control. */
    isPasteArmed: boolean;
    /** True when this cell is part of the current multi-select. */
    isSelected: boolean;
    /** True when this cell is the source of the copied payload. */
    isCopySource: boolean;
    onAddShift: (date: string) => void;
    onCopy: (day: CalendarDay) => void;
    onPaste: (date: string) => void;
    onEditShift: (shift: Shift) => void;
    onDeleteShift: (shift: Shift) => void;
    /** Toggles this cell in the multi-select (ctrl/⌘-click or marquee drag). */
    onToggleSelect: (date: string, additive: boolean) => void;
    /** Expands the cell into the day view. */
    onViewDay: (date: string) => void;
    /** Opens a branch chip's roster in the Roster Details workspace. */
    onViewRoster: (rosterId: string) => void;
    /** Opens the branch-day editor from a branch chip's edit control. */
    onEditBranchDay: (summary: BranchDaySummary, date: string) => void;
    /** Requests deletion of every shift in a branch-day. */
    onDeleteBranchDay: (summary: BranchDaySummary, date: string) => void;
    /**
     * Opens the full branch list for this day, used by the `+N more` control in
     * branch mode. Without it the overflow falls back to the day view.
     */
    onViewAllBranches?: (day: CalendarDay) => void;

    onShiftDragStart?: (shift: Shift) => void;


    onShiftDragEnd?: () => void;
    /** Drops the dragged shift onto this date. */
    onDropShift?: (date: string) => void;
}

/**
 * One day of the month grid: date number, its shift chips, and the
 * add/copy/paste controls.
 *
 * The add control is deliberately **disabled once every branch in scope already
 * has a shift** that day, with an explanatory tooltip — a disabled control with no
 * reason is worse than no control at all.
 */
export function RosterMonthCell({
    day,
    contentMode,
    isoWeek = null,
    weekShiftCount = 0,
    onViewWeek,
    showBranchNames,
    isPasteArmed,
    isSelected,
    isCopySource,
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
    onViewAllBranches,
    onShiftDragStart,


    onShiftDragEnd,
    onDropShift,
}: RosterMonthCellProps): JSX.Element {
    const isBranchMode = contentMode === 'branches';

    // Both modes cap at the same number of rows so cell heights stay uniform and
    // the month grid keeps its rhythm regardless of how busy a day is.
    const visibleShifts = day.shifts.slice(0, MAX_VISIBLE_CHIPS);
    const visibleBranches = day.branchSummaries.slice(0, MAX_VISIBLE_CHIPS);

    const hiddenCount = isBranchMode
        ? day.branchSummaries.length - visibleBranches.length
        : day.shifts.length - visibleShifts.length;

    const hasShifts = day.shifts.length > 0;

    const addDisabledReason = day.allBranchesCovered
        ? 'Every branch already has shifts on this day'
        : undefined;

    return (
        <div
            role="gridcell"
            aria-selected={isSelected}
            aria-label={day.date}
            onClick={(event) => onToggleSelect(day.date, event.ctrlKey || event.metaKey)}
            onDragOver={(event) => {
                if (onDropShift) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                }
            }}
            onDrop={(event) => {
                if (onDropShift) {
                    event.preventDefault();
                    onDropShift(day.date);
                }
            }}
            className={cn(
                'group/cell relative flex min-h-28 flex-col gap-1 border-b border-r border-border p-1.5 transition-colors',
                // Padded days from the adjacent month recede so the focused month reads first.
                day.isCurrentPeriod ? 'bg-card' : 'bg-muted/30',
                day.isWeekend && day.isCurrentPeriod && 'bg-secondary/30',
                isSelected && 'ring-2 ring-inset ring-primary',
                isCopySource && 'ring-2 ring-inset ring-info',
            )}
        >
            {/* Date + week drill-down */}
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onViewDay(day.date);
                    }}
                    aria-label={`Open ${day.date}`}
                    className={cn(
                        'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        day.isToday
                            ? 'bg-primary text-primary-foreground'
                            : day.isCurrentPeriod
                                ? 'text-foreground hover:bg-secondary'
                                : 'text-muted-foreground hover:bg-secondary',
                    )}
                >
                    {day.dayOfMonth}
                </button>

                {/*
                 * Week drill-down lives in the Monday cell so the grid needs no
                 * dateless gutter column. It sits beside the date (not top-right)
                 * so the hover action toolbar never covers it, and stays
                 * permanently visible as the row's primary navigation affordance.
                 */}
                {isoWeek !== null && onViewWeek ? (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onViewWeek();
                        }}
                        title={`Open week ${isoWeek} overview (${weekShiftCount} shifts)`}
                        aria-label={`Open week ${isoWeek} overview, ${weekShiftCount} shifts`}
                        className="inline-flex h-5 items-center gap-0.5 rounded bg-secondary/70 px-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <CalendarRange className="h-2.5 w-2.5" aria-hidden="true" />
                        <span className="tabular-nums">W{isoWeek}</span>
                    </button>
                ) : null}
            </div>

            {/* Cell actions, revealed on hover but always keyboard reachable. */}
            <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/cell:opacity-100">
                <div className="flex items-center gap-0.5 rounded-md bg-card/95 p-0.5 shadow-sm">
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onAddShift(day.date);
                        }}
                        disabled={day.allBranchesCovered}
                        title={addDisabledReason ?? 'Add shifts'}
                        aria-label={addDisabledReason ?? `Add shifts on ${day.date}`}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onCopy(day);
                        }}
                        disabled={!hasShifts}
                        title={hasShifts ? 'Copy this day' : 'Nothing to copy'}
                        aria-label={`Copy shifts from ${day.date}`}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
                    >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    {/* Paste only materialises once something has been copied. */}
                    {isPasteArmed && !isCopySource ? (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onPaste(day.date);
                            }}
                            title="Paste copied shifts"
                            aria-label={`Paste copied shifts into ${day.date}`}
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-info transition-colors hover:bg-info/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                    ) : null}
                </div>
            </div>

            {/* Cell content: branch coverage (month) or individual shifts (week/day) */}
            <div className="flex flex-1 flex-col gap-1">
                {isBranchMode
                    ? visibleBranches.map((summary) => (
                        <BranchDayChip
                            key={summary.branchId}
                            summary={summary}
                            date={day.date}
                            onOpenRoster={onViewRoster}
                            onOpenDay={onViewDay}
                            onEdit={onEditBranchDay}
                            onDelete={onDeleteBranchDay}
                        />

                    ))
                    : visibleShifts.map((shift) => (
                        <ShiftChip
                            key={shift.id}
                            shift={shift}
                            showBranch={showBranchNames}
                            onEdit={onEditShift}
                            onDelete={onDeleteShift}
                            draggable={Boolean(onShiftDragStart)}
                            onDragStart={onShiftDragStart}
                            onDragEnd={onShiftDragEnd}
                        />
                    ))}

                {/*
                 * Overflow sits at the very bottom of the chip stack, after the
                 * last branch, so it reads as "…and the rest of this list".
                 *
                 * In branch mode it opens the day's full branch list in place
                 * rather than navigating to the day view: the manager is scanning
                 * the month, and losing that context to read three more rows is a
                 * poor trade. Shift mode keeps the day-view drill-down, which is
                 * the right tool for reading individual shifts.
                 */}
                {hiddenCount > 0 ? (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();

                            if (isBranchMode && onViewAllBranches) {
                                onViewAllBranches(day);
                                return;
                            }

                            onViewDay(day.date);
                        }}
                        title={
                            isBranchMode && onViewAllBranches
                                ? `Show all ${day.branchSummaries.length} branches on ${day.date}`
                                : `Open ${day.date}`
                        }
                        aria-label={
                            isBranchMode
                                ? `Show all ${day.branchSummaries.length} branches on ${day.date}`
                                : `Show all ${day.shifts.length} shifts on ${day.date}`
                        }
                        className="mt-auto rounded px-1 py-0.5 text-left text-[10px] font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {hiddenCount} more {isBranchMode ? 'branches' : 'shifts'}...
                    </button>
                ) : null}

            </div>
        </div>
    );
}
