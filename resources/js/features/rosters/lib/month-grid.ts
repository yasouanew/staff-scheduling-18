/**
 * Pure calendar-projection helpers for the roster month/week/day calendar.
 *
 * The persisted model stores one roster per *branch per ISO week*, so a calendar
 * cell (a single day, potentially spanning every branch) is a **projection over
 * shifts** rather than a roster record. Everything here is deliberately pure and
 * date-only so it can be unit tested and reused by the week/day views.
 *
 * Weeks are Monday-first to match `rosters.week_start` / `week_end`.
 */

import {
    addDays,
    addMonths,
    addWeeks,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    getISOWeek,
    isSameDay,
    isSameMonth,
    isSameYear,
    isValid,
    parseISO,
    startOfMonth,
    startOfWeek,
} from 'date-fns';


import type { RosterStatus } from '@/types/roster-management';
import type { Shift } from '@/types/shift';


/** Monday-first weeks, matching the ISO roster week. */
const WEEK_OPTIONS = { weekStartsOn: 1 } as const;

/** Wire/date-key format used across the scheduling API. */
export const ISO_DATE_FORMAT = 'yyyy-MM-dd';

/** Granularity of the calendar canvas. */
export type CalendarViewMode = 'month' | 'week' | 'day';

/** Column headers for the month/week grids, Monday-first. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * What a month cell renders.
 *
 * Month view answers "which branches are covered this day?", so it aggregates to
 * `branches`; week/day views have the room to render individual `shifts`.
 */
export type CellContentMode = 'branches' | 'shifts';

/** Bucket key for shifts that are not linked to a branch. */
const UNASSIGNED_BRANCH_KEY = 'unassigned';

/** Label used for the {@link UNASSIGNED_BRANCH_KEY} bucket. */
const UNASSIGNED_BRANCH_LABEL = 'Unassigned branch';


/** Formats a date as the `yyyy-MM-dd` key used by cells and the API. */
export function toIsoDate(date: Date): string {
    return format(date, ISO_DATE_FORMAT);
}

/** An inclusive ISO date range, ready to pass as `date_from` / `date_to`. */
export interface DateRange {
    start: string;
    end: string;
}

/**
 * Inclusive date range the given view needs to fetch.
 *
 * Month view intentionally covers the **padded** grid (leading/trailing days of
 * the adjacent months) so those cells are populated rather than misleadingly
 * empty.
 */
export function getVisibleRange(cursor: Date, view: CalendarViewMode): DateRange {
    if (view === 'day') {
        const iso = toIsoDate(cursor);
        return { start: iso, end: iso };
    }

    if (view === 'week') {
        return {
            start: toIsoDate(startOfWeek(cursor, WEEK_OPTIONS)),
            end: toIsoDate(endOfWeek(cursor, WEEK_OPTIONS)),
        };
    }

    return {
        start: toIsoDate(startOfWeek(startOfMonth(cursor), WEEK_OPTIONS)),
        end: toIsoDate(endOfWeek(endOfMonth(cursor), WEEK_OPTIONS)),
    };
}

/**
 * Human label for the current period, rendered in the centre of the toolbar.
 *
 * Week labels collapse shared month/year segments (`9 – 15 Mar 2026` rather than
 * `9 Mar 2026 – 15 Mar 2026`) to stay scannable.
 */
export function formatPeriodLabel(cursor: Date, view: CalendarViewMode): string {
    if (view === 'day') {
        return format(cursor, 'EEE d MMM yyyy');
    }

    if (view === 'week') {
        const start = startOfWeek(cursor, WEEK_OPTIONS);
        const end = endOfWeek(cursor, WEEK_OPTIONS);

        if (isSameMonth(start, end)) {
            return `${format(start, 'd')} – ${format(end, 'd MMM yyyy')}`;
        }

        return isSameYear(start, end)
            ? `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
            : `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
    }

    return format(cursor, 'MMMM yyyy');
}

/** Moves the cursor one period forward (`1`) or back (`-1`) for the view. */
export function stepCursor(cursor: Date, view: CalendarViewMode, direction: 1 | -1): Date {
    if (view === 'day') return addDays(cursor, direction);
    if (view === 'week') return addWeeks(cursor, direction);
    return addMonths(cursor, direction);
}

/** Groups shifts by their ISO date, preserving a stable in-cell ordering. */
export function groupShiftsByDate(shifts: readonly Shift[]): Map<string, Shift[]> {
    const byDate = new Map<string, Shift[]>();

    for (const shift of shifts) {
        if (!shift.date) continue;
        const bucket = byDate.get(shift.date);
        if (bucket) {
            bucket.push(shift);
        } else {
            byDate.set(shift.date, [shift]);
        }
    }

    for (const bucket of byDate.values()) {
        bucket.sort(
            (a, b) =>
                a.startTime.localeCompare(b.startTime) ||
                (a.branch?.name ?? '').localeCompare(b.branch?.name ?? ''),
        );
    }

    return byDate;
}

/**
 * One branch's aggregated coverage for a single day, rendered by the month view.
 *
 * Month cells are ~7rem wide, so listing individual shifts there is unreadable
 * once a branch has more than one or two. Aggregating to "branch + how many
 * shifts + the span they cover" answers the question the month view actually
 * asks — *is this branch covered?* — and leaves per-shift detail to week/day.
 */
export interface BranchDaySummary {
    /** Branch id, or {@link UNASSIGNED_BRANCH_KEY} for shifts without a branch. */
    branchId: string;
    branchName: string;
    /**
     * The roster these shifts belong to, i.e. the drill-down target for the
     * branch chip.
     *
     * One roster covers a single branch for a single ISO week, so every shift in
     * this bucket necessarily shares one roster and the first shift's id is
     * authoritative. `null` only when the bucket holds shifts with no roster at
     * all, in which case the chip has nowhere to navigate.
     */
    rosterId: string | null;

    /** Number of shifts rostered at this branch on this day. */
    shiftCount: number;
    /** Earliest start time across the branch's shifts (`HH:mm`). */
    earliestStart: string;
    /** Latest end time across the branch's shifts (`HH:mm`). */
    latestEnd: string;
    /** Distinct employees assigned; excludes open (unassigned) shifts. */
    assignedCount: number;
    /** Shifts with no employee assigned, surfaced as a gap to fill. */
    openCount: number;
    /**
     * Publication state of the roster behind these shifts.
     *
     * A branch-day maps onto exactly one roster week, so a single status is
     * accurate rather than a lossy summary. Read from the shifts themselves so a
     * chip can tell a manager whether staff have already seen this day.
     */
    rosterStatus: RosterStatus;
    /** The branch's shifts, so the cell can hand them to the day/edit flows. */
    shifts: Shift[];
}

/**
 * Publication breakdown of the visible period, shown as the calendar's analysis
 * cards.
 *
 * Counted in **shifts, not rosters**, because that is the unit the calendar
 * renders and the unit a manager is deciding about. Draft is the number still
 * invisible to staff, which is the figure that actually needs action.
 */
export interface CalendarPublicationStats {
    /** Every shift in the visible range. */
    totalShifts: number;
    /** Shifts whose roster is still a draft — not yet visible to staff. */
    draftShifts: number;
    /** Shifts whose roster is published — staff have been notified. */
    publishedShifts: number;
    /** Shifts on archived rosters, kept for history only. */
    archivedShifts: number;
    /** Distinct draft rosters, i.e. how many weeks still need publishing. */
    draftRosters: number;
    /** Shifts with nobody assigned, across every publication state. */
    openShifts: number;
}

/**
 * Derives the publication breakdown for the shifts currently on screen.
 *
 * Pure and O(shifts) so it can run on every render without memoisation concerns.
 */
export function derivePublicationStats(shifts: readonly Shift[]): CalendarPublicationStats {
    const draftRosterIds = new Set<string>();

    let draftShifts = 0;
    let publishedShifts = 0;
    let archivedShifts = 0;
    let openShifts = 0;

    for (const shift of shifts) {
        if (shift.rosterStatus === 'published') {
            publishedShifts += 1;
        } else if (shift.rosterStatus === 'archived') {
            archivedShifts += 1;
        } else {
            draftShifts += 1;
            if (shift.rosterId) draftRosterIds.add(shift.rosterId);
        }

        if (shift.employeeId === null) openShifts += 1;
    }

    return {
        totalShifts: shifts.length,
        draftShifts,
        publishedShifts,
        archivedShifts,
        draftRosters: draftRosterIds.size,
        openShifts,
    };
}

/* -------------------------------------------------------------------------- */
/* Branch-week publication index                                              */
/* -------------------------------------------------------------------------- */

/**
 * Stable key identifying the roster that owns a `(branch, date)` pair.
 *
 * Rosters are stored per **branch per ISO week**, so any date inside a week maps
 * onto the same roster. Snapping to the Monday is therefore what makes the key
 * canonical: 11 March and 14 March at the same branch produce one key, exactly
 * as they produce one roster.
 */
export function branchWeekKey(branchId: string, date: string): string {
    const parsed = parseISO(date);
    const monday = isValid(parsed) ? toIsoDate(startOfWeek(parsed, WEEK_OPTIONS)) : date;

    return `${branchId}|${monday}`;
}

/**
 * Publication state of every branch-week visible on the calendar, keyed by
 * {@link branchWeekKey}.
 *
 * The Add Shift flow has to tell a manager what saving will actually do, and that
 * depends on the roster the new shifts will join: adding to an already-published
 * week makes them visible immediately, whereas adding to a draft week does not.
 * Deriving that from the shifts already on screen keeps the wizard honest without
 * an extra request — and a branch-week with no shifts yet is simply absent, which
 * correctly reads as "a new draft week will be opened".
 *
 * Draft wins over published for the same key: if any shift in the week is still
 * hidden, the week cannot be described as fully sent.
 */
export function buildBranchWeekStatusIndex(
    shifts: readonly Shift[],
): Map<string, RosterStatus> {
    const index = new Map<string, RosterStatus>();

    for (const shift of shifts) {
        if (!shift.branchId || !shift.date) continue;

        const key = branchWeekKey(shift.branchId, shift.date);

        if (!index.has(key) || shift.rosterStatus === 'draft') {
            index.set(key, shift.rosterStatus);
        }
    }

    return index;
}


/** A single day cell of the calendar. */

export interface CalendarDay {
    /** ISO date (`yyyy-MM-dd`), also the cell's stable key. */
    date: string;
    /** Day of the month, 1–31. */
    dayOfMonth: number;
    /** False for the padded days belonging to the adjacent month. */
    isCurrentPeriod: boolean;
    isToday: boolean;
    isWeekend: boolean;
    /** Shifts falling on this day, already filtered by the active branch scope. */
    shifts: Shift[];
    /**
     * Per-branch aggregation of {@link CalendarDay.shifts}, ordered by branch
     * name. This is what the month view renders instead of individual shifts.
     */
    branchSummaries: BranchDaySummary[];
    /** Distinct branch ids that already have at least one shift this day. */
    coveredBranchIds: string[];
    /**
     * True when every branch in scope already has a shift, which disables the
     * cell's add control (there is nothing left to schedule).
     */
    allBranchesCovered: boolean;
}

/** One week row of the month grid; doubles as the week-view row. */
export interface CalendarWeek {
    /** Stable key + drill-down target: ISO date of the Monday. */
    weekStart: string;
    /** ISO date of the Sunday. */
    weekEnd: string;
    /** ISO week number (1–53), shown on the row's drill-down control. */
    isoWeek: number;
    /** Exactly seven days, Monday-first. */
    days: CalendarDay[];
    /** Total shifts in the row, shown on the drill-down affordance. */
    shiftCount: number;
}

interface BuildCalendarOptions {
    /** Any date inside the period being displayed. */
    cursor: Date;
    /** Shifts already filtered to the active branch/status scope. */
    shifts: readonly Shift[];
    /** Branch ids in scope, used to derive {@link CalendarDay.allBranchesCovered}. */
    branchIds: readonly string[];
    /** Injectable "now" so the grid stays deterministic under test. */
    today?: Date;
}

/**
 * Builds the padded Monday-first month matrix (5 or 6 week rows × 7 days).
 *
 * Shifts are bucketed per day in a single pass, so rendering a month across every
 * branch stays O(shifts + days).
 */
export function buildMonthGrid({
    cursor,
    shifts,
    branchIds,
    today = new Date(),
}: BuildCalendarOptions): CalendarWeek[] {
    const byDate = groupShiftsByDate(shifts);
    const gridStart = startOfWeek(startOfMonth(cursor), WEEK_OPTIONS);
    const gridEnd = endOfWeek(endOfMonth(cursor), WEEK_OPTIONS);
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

    const weeks: CalendarWeek[] = [];

    for (let index = 0; index < days.length; index += 7) {
        const rowDays = days.slice(index, index + 7).map((day) => toCalendarDay(day, {
            byDate,
            branchIds,
            today,
            focusMonth: cursor,
        }));

        weeks.push({
            weekStart: rowDays[0]?.date ?? toIsoDate(gridStart),
            weekEnd: rowDays[rowDays.length - 1]?.date ?? toIsoDate(gridEnd),
            isoWeek: getISOWeek(days[index] ?? gridStart),
            days: rowDays,
            shiftCount: rowDays.reduce((total, day) => total + day.shifts.length, 0),
        });
    }

    return weeks;
}

/**
 * Builds a single Monday-first week row, used by the week view (and reused by the
 * day view with a one-day slice).
 */
export function buildWeek({
    cursor,
    shifts,
    branchIds,
    today = new Date(),
}: BuildCalendarOptions): CalendarWeek {
    const byDate = groupShiftsByDate(shifts);
    const start = startOfWeek(cursor, WEEK_OPTIONS);
    const end = endOfWeek(cursor, WEEK_OPTIONS);

    const days = eachDayOfInterval({ start, end }).map((day) =>
        toCalendarDay(day, { byDate, branchIds, today, focusMonth: null }),
    );

    return {
        weekStart: toIsoDate(start),
        weekEnd: toIsoDate(end),
        isoWeek: getISOWeek(start),
        days,
        shiftCount: days.reduce((total, day) => total + day.shifts.length, 0),
    };
}

interface ToCalendarDayContext {
    byDate: Map<string, Shift[]>;
    branchIds: readonly string[];
    today: Date;
    /** Month used to flag padded cells, or `null` when every day is in period. */
    focusMonth: Date | null;
}

/**
 * Aggregates a day's shifts into one entry per branch, ordered by branch name.
 *
 * Shifts with no branch collapse into a single `Unassigned branch` bucket rather
 * than being dropped — an unrostered shift is exactly the kind of gap a manager
 * needs to see.
 */
export function summariseBranches(shifts: readonly Shift[]): BranchDaySummary[] {
    const byBranch = new Map<string, BranchDaySummary>();
    // Employees are counted per branch so the same person rostered twice at one
    // branch is one "assigned" head, not two.
    const employeesByBranch = new Map<string, Set<string>>();

    for (const shift of shifts) {
        const branchId = shift.branchId ?? UNASSIGNED_BRANCH_KEY;
        const branchName = shift.branch?.name ?? UNASSIGNED_BRANCH_LABEL;
        const existing = byBranch.get(branchId);

        if (existing) {
            existing.shiftCount += 1;
            existing.shifts.push(shift);
            if (shift.startTime < existing.earliestStart) existing.earliestStart = shift.startTime;
            if (shift.endTime > existing.latestEnd) existing.latestEnd = shift.endTime;
            if (shift.employeeId === null) existing.openCount += 1;
            // A branch-day normally shares one roster, but a shift left on a
            // draft roster keeps the whole chip reading as draft: the day is
            // only truly "published" once nothing in it is still hidden.
            if (shift.rosterStatus === 'draft') existing.rosterStatus = 'draft';
        } else {
            byBranch.set(branchId, {
                branchId,
                branchName,
                rosterId: shift.rosterId ?? null,
                shiftCount: 1,

                earliestStart: shift.startTime,
                latestEnd: shift.endTime,
                assignedCount: 0,
                openCount: shift.employeeId === null ? 1 : 0,
                rosterStatus: shift.rosterStatus,
                shifts: [shift],
            });
        }


        if (shift.employeeId !== null) {
            const employees = employeesByBranch.get(branchId);
            if (employees) {
                employees.add(shift.employeeId);
            } else {
                employeesByBranch.set(branchId, new Set([shift.employeeId]));
            }
        }
    }

    for (const [branchId, summary] of byBranch) {
        summary.assignedCount = employeesByBranch.get(branchId)?.size ?? 0;
    }

    return [...byBranch.values()].sort((a, b) => a.branchName.localeCompare(b.branchName));
}

/** Projects one calendar date into its cell view model. */
function toCalendarDay(
    day: Date,
    { byDate, branchIds, today, focusMonth }: ToCalendarDayContext,
): CalendarDay {
    const date = toIsoDate(day);
    const shifts = byDate.get(date) ?? [];
    const weekday = day.getDay();

    const coveredBranchIds = [
        ...new Set(shifts.map((shift) => shift.branchId).filter((id): id is string => Boolean(id))),
    ];

    return {
        date,
        dayOfMonth: day.getDate(),
        isCurrentPeriod: focusMonth === null || isSameMonth(day, focusMonth),
        isToday: isSameDay(day, today),
        isWeekend: weekday === 0 || weekday === 6,
        shifts,
        branchSummaries: summariseBranches(shifts),
        coveredBranchIds,
        allBranchesCovered:
            branchIds.length > 0 && branchIds.every((id) => coveredBranchIds.includes(id)),
    };
}
