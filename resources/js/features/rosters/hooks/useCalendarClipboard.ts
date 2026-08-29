import { useCallback, useMemo, useState } from 'react';

import type { Shift } from '@/types/shift';

import type { CalendarDay } from '../lib/month-grid';

/**
 * A copied shift, reduced to exactly the fields `ShiftMutationInput` accepts plus
 * the `branchId` needed to resolve the destination week's roster.
 *
 * Deliberately excludes the shift id: a snapshot must never be able to resurrect
 * or overwrite the identity of the shift it was copied from.
 */
export interface ClipboardEntry {
    /** Drives roster resolution at the destination; not sent in the payload. */
    branchId: string | null;
    employeeId: string | null;
    positionId: string | null;
    startTime: string;
    endTime: string;
    requiredStaff: number;
    notes: string | null;
}

/** Clipboard contents plus the cell it came from. */

export interface ClipboardPayload {
    sourceDate: string;
    entries: ClipboardEntry[];
}

/** Projects a live shift into a paste-safe snapshot. */
function toEntry(shift: Shift): ClipboardEntry {
    return {
        branchId: shift.branchId,
        employeeId: shift.employeeId,
        positionId: shift.positionId,
        startTime: shift.startTime,
        endTime: shift.endTime,
        requiredStaff: shift.requiredStaff,

        notes: shift.notes,
    };
}

interface CalendarClipboard {
    payload: ClipboardPayload | null;
    /** True once something has been copied, which arms every cell's paste control. */
    isArmed: boolean;
    /** ISO date the payload was copied from, for the source highlight. */
    sourceDate: string | null;
    copyDay: (day: CalendarDay) => number;
    clear: () => void;
    /** ISO dates currently selected as paste targets. */
    selectedDates: ReadonlySet<string>;
    /** Adds/removes a date; non-additive clicks collapse the selection. */
    toggleSelection: (date: string, additive: boolean) => void;
    clearSelection: () => void;
    /**
     * Paste targets for a click on `date`: the whole multi-selection when the
     * clicked cell is part of it, otherwise just that cell.
     */
    resolveTargets: (date: string) => string[];
}

/**
 * Owns the calendar's copy/paste clipboard and multi-cell selection.
 *
 * Kept as a hook (not a global store) so the state dies with the calendar page —
 * a stale cross-page clipboard pasting week-old shifts would be a data hazard.
 */
export function useCalendarClipboard(): CalendarClipboard {
    const [payload, setPayload] = useState<ClipboardPayload | null>(null);
    const [selectedDates, setSelectedDates] = useState<ReadonlySet<string>>(() => new Set());

    const copyDay = useCallback((day: CalendarDay): number => {
        const entries = day.shifts.map(toEntry);
        setPayload(entries.length > 0 ? { sourceDate: day.date, entries } : null);
        return entries.length;
    }, []);

    const clear = useCallback(() => {
        setPayload(null);
        setSelectedDates(new Set());
    }, []);

    const toggleSelection = useCallback((date: string, additive: boolean) => {
        setSelectedDates((current) => {
            if (!additive) {
                // A plain click on the only selected cell clears it; otherwise it
                // becomes the sole selection.
                if (current.size === 1 && current.has(date)) return new Set();
                return new Set([date]);
            }

            const next = new Set(current);
            if (next.has(date)) {
                next.delete(date);
            } else {
                next.add(date);
            }
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => setSelectedDates(new Set()), []);

    const resolveTargets = useCallback(
        (date: string): string[] =>
            selectedDates.has(date) && selectedDates.size > 1 ? [...selectedDates] : [date],
        [selectedDates],
    );

    return useMemo(
        () => ({
            payload,
            isArmed: payload !== null,
            sourceDate: payload?.sourceDate ?? null,
            copyDay,
            clear,
            selectedDates,
            toggleSelection,
            clearSelection,
            resolveTargets,
        }),
        [
            payload,
            copyDay,
            clear,
            selectedDates,
            toggleSelection,
            clearSelection,
            resolveTargets,
        ],
    );
}
