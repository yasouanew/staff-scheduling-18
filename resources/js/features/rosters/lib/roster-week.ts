import {
    addDays,
    differenceInCalendarDays,
    format,
    isValid,
    parseISO,
    startOfWeek,
} from 'date-fns';

import type {
    RosterGridCell,
    RosterGridGroup,
    RosterGridRow,
    RosterShift,
    RosterWeekSummary,
} from '@/types/roster-management';

/**
 * Pure date/duration helpers for the roster management feature.
 *
 * Everything here is side-effect free so it can be unit tested and shared by
 * both presentational components and the data hooks.
 */

/** Number of days in a roster week. */
export const DAYS_IN_WEEK = 7;

/** Short weekday labels, Monday-first (matches Australian rostering). */
export const WEEKDAY_LABELS: readonly string[] = [
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
] as const;

/** Safely parse an ISO date string, returning `null` when unusable. */
export function parseIsoDate(value: string | null | undefined): Date | null {
    if (!value) {
        return null;
    }

    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : null;
}

/** Format an ISO date as `yyyy-MM-dd` (the backend's expected wire format). */
export function toIsoDate(date: Date): string {
    return format(date, 'yyyy-MM-dd');
}

/** Monday of the week containing `date`. */
export function mondayOf(date: Date): Date {
    return startOfWeek(date, { weekStartsOn: 1 });
}

/** ISO date of the Monday for the current week. */
export function currentWeekStart(): string {
    return toIsoDate(mondayOf(new Date()));
}

/** ISO date of the Monday for next week. */
export function nextWeekStart(): string {
    return toIsoDate(addDays(mondayOf(new Date()), DAYS_IN_WEEK));
}

/** Derives the inclusive week end (Sunday) from a week start ISO date. */
export function weekEndFor(weekStart: string): string {
    const start = parseIsoDate(weekStart);
    if (!start) {
        return weekStart;
    }

    return toIsoDate(addDays(start, DAYS_IN_WEEK - 1));
}

/**
 * Human-readable week range, e.g. `12 – 18 Aug 2026`. Collapses the month when
 * both ends fall in the same month, and falls back gracefully on bad input.
 */
export function formatWeekRange(
    weekStart: string | null,
    weekEnd: string | null,
): string {
    const start = parseIsoDate(weekStart);
    const end = parseIsoDate(weekEnd);

    if (!start) {
        return 'Unscheduled week';
    }

    if (!end) {
        return format(start, 'd MMM yyyy');
    }

    const sameMonth =
        start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();

    return sameMonth
        ? `${format(start, 'd')} – ${format(end, 'd MMM yyyy')}`
        : `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
}

/** Short label for a single day column, e.g. `Mon 12`. */
export function formatDayLabel(date: Date): string {
    return format(date, 'EEE d');
}

/** Longer accessible label for a day column, e.g. `Monday 12 August`. */
export function formatDayLabelLong(date: Date): string {
    return format(date, 'EEEE d MMMM');
}

/** The seven consecutive dates of a roster week, Monday-first. */
export function weekDays(weekStart: string | null): Date[] {
    const start = parseIsoDate(weekStart) ?? mondayOf(new Date());

    return Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDays(start, index));
}

/** Relative label describing how far a week is from today. */
export function describeWeekOffset(weekStart: string | null): string {
    const start = parseIsoDate(weekStart);
    if (!start) {
        return 'No dates set';
    }

    const weeks = Math.round(
        differenceInCalendarDays(mondayOf(start), mondayOf(new Date())) / DAYS_IN_WEEK,
    );

    if (weeks === 0) {
        return 'This week';
    }
    if (weeks === 1) {
        return 'Next week';
    }
    if (weeks === -1) {
        return 'Last week';
    }

    return weeks > 0 ? `In ${weeks} weeks` : `${Math.abs(weeks)} weeks ago`;
}

/** Convert a `HH:mm` time into minutes past midnight (`null` when invalid). */
export function timeToMinutes(time: string | null): number | null {
    if (!time) {
        return null;
    }

    const [hours, minutes] = time.split(':');
    const h = Number(hours);
    const m = Number(minutes);

    if (!Number.isFinite(h) || !Number.isFinite(m)) {
        return null;
    }

    return h * 60 + m;
}

/**
 * The minimal time-bearing shape needed to compute a shift's hours.
 *
 * Declared structurally (rather than requiring a full `RosterShift`) so the
 * quick editor can preview payable hours from unsaved form values, which have no
 * id, date or roster yet.
 */
export interface ShiftTimeSpan {
    /** Local start time, `HH:mm`. */
    startTime: string | null;
    /** Local end time, `HH:mm`. */
    endTime: string | null;
    /** Break length in minutes. */
    breakMinutes: number;
    /** When true the break is paid and is not deducted. */
    isPaidBreak: boolean;
}

/** Total span of a shift in minutes, treating an earlier end as overnight. */
export function shiftSpanMinutes(shift: ShiftTimeSpan): number {
    const start = timeToMinutes(shift.startTime);
    const end = timeToMinutes(shift.endTime);

    if (start === null || end === null) {

        return 0;
    }

    const span = end >= start ? end - start : end + 24 * 60 - start;
    return Math.max(0, span);
}

/** Payable minutes for a shift (unpaid breaks are deducted). */
export function shiftPayableMinutes(shift: ShiftTimeSpan): number {
    const span = shiftSpanMinutes(shift);
    const deduction = shift.isPaidBreak ? 0 : Math.max(0, shift.breakMinutes);


    return Math.max(0, span - deduction);
}

/** `9:00 AM – 5:00 PM` style range, or an em dash when times are missing. */
export function formatShiftTimeRange(shift: Pick<ShiftTimeSpan, 'startTime' | 'endTime'>): string {
    if (!shift.startTime || !shift.endTime) {

        return '—';
    }

    const render = (time: string): string => {
        const minutes = timeToMinutes(time);
        if (minutes === null) {
            return time;
        }

        const reference = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
        return format(reference, 'h:mm a');
    };

    return `${render(shift.startTime)} – ${render(shift.endTime)}`;
}

/** Round hours to one decimal place for compact display. */
export function formatHours(minutes: number): string {
    return `${(Math.round((minutes / 60) * 10) / 10).toFixed(1)}h`;
}

/** Aggregate roster-level counters used by the detail page KPI row. */
export function summarizeWeek(shifts: readonly RosterShift[]): RosterWeekSummary {
    const employeeIds = new Set<string>();
    let payable = 0;
    let openShifts = 0;

    for (const shift of shifts) {
        payable += shiftPayableMinutes(shift);

        if (shift.employeeId) {
            employeeIds.add(shift.employeeId);
        } else {
            openShifts += 1;
        }
    }

    return {
        shiftCount: shifts.length,
        totalHours: Math.round((payable / 60) * 10) / 10,
        openShifts,
        employeeCount: employeeIds.size,
    };
}

/** Group shifts by their ISO date so the week grid can render day columns. */
export function groupShiftsByDate(
    shifts: readonly RosterShift[],
): Map<string, RosterShift[]> {
    const grouped = new Map<string, RosterShift[]>();

    for (const shift of shifts) {
        if (!shift.date) {
            continue;
        }

        const bucket = grouped.get(shift.date);
        if (bucket) {
            bucket.push(shift);
        } else {
            grouped.set(shift.date, [shift]);
        }
    }

    // Keep each day ordered by start time for a predictable reading order.
    for (const bucket of grouped.values()) {
        bucket.sort((a, b) => (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0));
    }

    return grouped;
}

/* -------------------------------------------------------------------------- */
/* Matrix grid derivation (rows = employees, columns = Mon → Sun)             */
/* -------------------------------------------------------------------------- */

/** Row key used for the synthetic row that collects unassigned shifts. */
export const OPEN_SHIFTS_ROW_KEY = 'open-shifts';

/** Label shown for the unassigned/vacancy row. */
export const OPEN_SHIFTS_ROW_LABEL = 'Open shifts';

/** Group key used when a shift has neither department nor branch context. */
const UNGROUPED_KEY = 'ungrouped';

/** True when a shift carries any conflict flag. */
export function hasConflict(shift: RosterShift): boolean {
    return shift.flags.overtimeRisk || shift.flags.leaveConflict || shift.flags.doubleBooked;
}

/** Human-readable list of the active conflicts on a shift. */
export function describeConflicts(shift: RosterShift): string[] {
    const reasons: string[] = [];

    if (shift.flags.overtimeRisk) {
        reasons.push('Overtime risk: exceeds ordinary hours');
    }
    if (shift.flags.leaveConflict) {
        reasons.push('Leave conflict: employee has leave booked');
    }
    if (shift.flags.doubleBooked) {
        reasons.push('Double booked: overlaps another shift');
    }

    return reasons;
}

/** Most frequently occurring value in a list, used to pick a row's main role. */
function mostCommon(values: readonly (string | null)[]): string | null {
    const counts = new Map<string, number>();

    for (const value of values) {
        if (value) {
            counts.set(value, (counts.get(value) ?? 0) + 1);
        }
    }

    let best: string | null = null;
    let bestCount = 0;

    for (const [value, count] of counts) {
        if (count > bestCount) {
            best = value;
            bestCount = count;
        }
    }

    return best;
}

/** An employee who was added to the roster but has no shifts yet. */
export interface AddedEmployee {
    /** Stable employee id. */
    id: string;
    /** Display name. */
    name: string;
    /** Avatar URL, when available. */
    avatarUrl: string | null;
    /** Primary position/role label, when known. */
    positionName: string | null;
    /** Position colour used to tint the row's avatar ring. */
    positionColor: string | null;
    /** Department name used to group the row, when known. */
    departmentName: string | null;
    /** Branch name used to group the row, when known. */
    branchName: string | null;
}

/**
 * Build the employee × weekday matrix consumed by the roster grid.
 *
 * Rows are grouped by `department · branch` so large rosters stay scannable,
 * then sorted alphabetically. Unassigned shifts collapse into a single "Open
 * shifts" row pinned to the end of its group. Every row always contains exactly
 * seven cells aligned to `weekStart`, so the CSS grid never has holes.
 *
 * `addedEmployees` are employees placed on the roster but not yet scheduled.
 * They are seeded as rows with seven empty cells so a manager can add shifts to
 * them later (the "Add Employees" flow); rows that already have a shift simply
 * merge into their existing grid row.
 */
export function buildRosterGrid(
    weekStart: string | null,
    shifts: readonly RosterShift[],
    addedEmployees: readonly AddedEmployee[] = [],
): RosterGridGroup[] {
    const dayKeys = weekDays(weekStart).map(toIsoDate);

    /** Accumulator for a single employee row while we walk the shift list. */
    interface RowAccumulator {
        row: RosterGridRow;
        groupKey: string;
        groupLabel: string;
        groupColor: string | null;
        positions: (string | null)[];
    }

    const rows = new Map<string, RowAccumulator>();

    for (const shift of shifts) {
        // A shift outside the roster's own week can't be placed in the matrix.
        if (!shift.date || !dayKeys.includes(shift.date)) {
            continue;
        }

        const isOpen = !shift.employeeId;
        const rowKey = isOpen ? OPEN_SHIFTS_ROW_KEY : `employee-${shift.employeeId}`;

        const departmentName = shift.departmentName;
        const branchName = shift.branchName;
        const groupLabel =
            [departmentName, branchName].filter(Boolean).join(' · ') || 'Unassigned department';
        const groupKey =
            departmentName || branchName
                ? `${departmentName ?? ''}|${branchName ?? ''}`
                : UNGROUPED_KEY;

        let entry = rows.get(rowKey);

        if (!entry) {
            entry = {
                groupKey: isOpen ? UNGROUPED_KEY : groupKey,
                groupLabel: isOpen ? 'Unfilled shifts' : groupLabel,
                groupColor: null,
                positions: [],
                row: {
                    key: rowKey,
                    employeeId: shift.employeeId,
                    name: isOpen ? OPEN_SHIFTS_ROW_LABEL : (shift.employeeName ?? 'Unnamed employee'),
                    avatarUrl: isOpen ? null : shift.employeeAvatarUrl,
                    positionName: null,
                    positionColor: null,
                    cells: dayKeys.map<RosterGridCell>((date) => ({ date, shifts: [] })),
                    totalMinutes: 0,
                    shiftCount: 0,
                    hasConflict: false,
                },
            };

            rows.set(rowKey, entry);
        }

        const cell = entry.row.cells[dayKeys.indexOf(shift.date)];
        if (cell) {
            cell.shifts.push(shift);
        }

        entry.positions.push(shift.positionName);
        entry.row.totalMinutes += shiftPayableMinutes(shift);
        entry.row.shiftCount += 1;
        entry.row.hasConflict = entry.row.hasConflict || hasConflict(shift);

        if (entry.row.positionColor === null && shift.positionColor !== null) {
            entry.row.positionColor = shift.positionColor;
        }
        if (entry.row.avatarUrl === null && shift.employeeAvatarUrl !== null && !isOpen) {
            entry.row.avatarUrl = shift.employeeAvatarUrl;
        }
    }

    // Seed rows for employees added to the roster but not yet scheduled. Their
    // seven cells stay empty so the manager can add shifts later; employees who
    // already appear via a shift simply have their metadata enriched below.
    for (const added of addedEmployees) {
        const rowKey = `employee-${added.id}`;
        let entry = rows.get(rowKey);

        if (!entry) {
            const departmentName = added.departmentName;
            const branchName = added.branchName;
            const groupLabel =
                [departmentName, branchName].filter(Boolean).join(' · ') || 'Unassigned department';
            const groupKey =
                departmentName || branchName
                    ? `${departmentName ?? ''}|${branchName ?? ''}`
                    : UNGROUPED_KEY;

            entry = {
                groupKey,
                groupLabel,
                groupColor: null,
                positions: [],
                row: {
                    key: rowKey,
                    employeeId: added.id,
                    name: added.name,
                    avatarUrl: added.avatarUrl,
                    positionName: added.positionName,
                    positionColor: added.positionColor,
                    cells: dayKeys.map<RosterGridCell>((date) => ({ date, shifts: [] })),
                    totalMinutes: 0,
                    shiftCount: 0,
                    hasConflict: false,
                },
            };

            rows.set(rowKey, entry);
        } else {
            // The employee already has a shift; enrich the row with directory
            // metadata the shift payload may not carry (e.g. empty-week rows).
            if (entry.row.avatarUrl === null && added.avatarUrl !== null) {
                entry.row.avatarUrl = added.avatarUrl;
            }
            if (entry.row.positionName === null && added.positionName !== null) {
                entry.row.positionName = added.positionName;
            }
            if (entry.row.positionColor === null && added.positionColor !== null) {
                entry.row.positionColor = added.positionColor;
            }
        }
    }

    // Order every cell by start time so blocks flow left-to-right by clock time.
    for (const entry of rows.values()) {
        entry.row.positionName = mostCommon(entry.positions);

        for (const cell of entry.row.cells) {
            cell.shifts.sort(
                (a, b) => (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0),
            );
        }
    }

    // Fold the rows into their department/branch groups.
    const groups = new Map<string, RosterGridGroup>();

    for (const entry of rows.values()) {
        const existing = groups.get(entry.groupKey);

        if (existing) {
            existing.rows.push(entry.row);
        } else {
            groups.set(entry.groupKey, {
                key: entry.groupKey,
                label: entry.groupLabel,
                color: entry.groupColor,
                rows: [entry.row],
            });
        }
    }

    for (const group of groups.values()) {
        group.rows.sort((a, b) => {
            // Keep the synthetic open-shifts row last within its group.
            if (a.key === OPEN_SHIFTS_ROW_KEY) {
                return 1;
            }
            if (b.key === OPEN_SHIFTS_ROW_KEY) {
                return -1;
            }

            return a.name.localeCompare(b.name);
        });
    }

    return Array.from(groups.values()).sort((a, b) => {
        if (a.key === UNGROUPED_KEY) {
            return 1;
        }
        if (b.key === UNGROUPED_KEY) {
            return -1;
        }

        return a.label.localeCompare(b.label);
    });
}

/** Total number of employee rows across every group. */
export function countGridRows(groups: readonly RosterGridGroup[]): number {
    return groups.reduce((total, group) => total + group.rows.length, 0);
}
