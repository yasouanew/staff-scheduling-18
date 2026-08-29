import { format, parseISO } from 'date-fns';

import type { Shift, ShiftConflict, ShiftStats } from '@/types/shift';

/** Converts a local `HH:mm` value into minutes since the start of the day. */
export function timeToMinutes(time: string): number {
    const [hours = '0', minutes = '0'] = time.split(':');
    return Number(hours) * 60 + Number(minutes);
}

/** Formats a shift's positive duration into a concise human-readable label. */
export function formatShiftDuration(startTime: string, endTime: string): string {
    const minutes = timeToMinutes(endTime) - timeToMinutes(startTime);

    if (!Number.isFinite(minutes) || minutes <= 0) {
        return '—';
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

/** Formats an ISO date in the workspace locale without coercing its timezone. */
export function formatShiftDate(date: string): string {
    if (!date) {
        return 'Unscheduled';
    }

    const parsed = parseISO(date);
    return Number.isNaN(parsed.getTime()) ? date : format(parsed, 'EEE, d MMM');
}

/** Formats a local shift time range, preserving the branch's stored wall time. */
export function formatShiftTimeRange(startTime: string, endTime: string): string {
    return `${startTime}–${endTime}`;
}

/** Produces the compact summary cards displayed at the top of the page. */
export function deriveShiftStats(shifts: readonly Shift[]): ShiftStats {
    return shifts.reduce<ShiftStats>(
        (stats, shift) => {
            const duration = timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime);

            return {
                total: stats.total + 1,
                open: stats.open + (shift.employeeId ? 0 : 1),
                assigned: stats.assigned + (shift.employeeId ? 1 : 0),
                totalHours: stats.totalHours + (duration > 0 ? duration / 60 : 0),
            };
        },
        { total: 0, open: 0, assigned: 0, totalHours: 0 },
    );
}

/**
 * Finds overlapping shifts for an employee. The backend stores shifts as one
 * local date plus branch wall-clock times, so comparisons intentionally retain
 * those values rather than parsing them in the browser's timezone.
 */
export function findEmployeeConflicts({
    shifts,
    employeeId,
    date,
    startTime,
    endTime,
    excludedShiftId,
}: {
    shifts: readonly Shift[];
    employeeId: string | null;
    date: string;
    startTime: string;
    endTime: string;
    excludedShiftId?: string;
}): ShiftConflict[] {
    if (!employeeId || !date || !startTime || !endTime) {
        return [];
    }

    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return [];
    }

    return shifts
        .filter(
            (shift) =>
                shift.id !== excludedShiftId &&
                shift.employeeId === employeeId &&
                shift.date === date &&
                shift.status !== 'cancelled',
        )
        .filter((shift) => start < timeToMinutes(shift.endTime) && end > timeToMinutes(shift.startTime))
        .map((shift) => ({
            shift,
            message: `${formatShiftTimeRange(shift.startTime, shift.endTime)} · ${shift.position?.name ?? 'Shift'}`,
        }));
}
