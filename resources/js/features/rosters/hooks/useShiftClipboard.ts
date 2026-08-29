import { useCallback, useMemo, useState } from 'react';

import type { RosterShift } from '@/types/roster-management';

import { toShiftTemplateValues, type ShiftTemplateValues } from '../lib/shift-payload';

/**
 * Stable key identifying a matrix cell (one employee row × one weekday column).
 *
 * The open-shifts row has no employee id, so it is keyed by the literal `open`
 * to keep every cell key unique and comparable.
 */
export function cellKey(employeeId: string | null, date: string): string {
    return `${employeeId ?? 'open'}|${date}`;
}

/** A cell's worth of copied shifts, plus enough context to describe the source. */
export interface ShiftClipboardEntry {
    /** Key of the cell the shifts were copied from (badges the source cell). */
    sourceCellKey: string;
    /** ISO date the shifts were copied from, surfaced in the paste tooltip. */
    sourceDate: string;
    /** Row label (employee name or `Open shifts`) used in toasts and tooltips. */
    sourceLabel: string;
    /** The copied, position-independent shift attributes. */
    shifts: ShiftTemplateValues[];
}

/** Imperative clipboard API returned by {@link useShiftClipboard}. */
export interface ShiftClipboard {
    /** Current clipboard contents, or `null` when nothing has been copied. */
    entry: ShiftClipboardEntry | null;
    /** True when a paste is possible. */
    isFilled: boolean;
    /** Key of the cell the current entry came from, or `null`. */
    sourceCellKey: string | null;
    /** Human-readable summary, e.g. `2 shifts from Alice Smith, Mon 12 Aug`. */
    description: string | null;
    /** Copies a cell's shifts, replacing anything already held. */
    copy: (args: {
        employeeId: string | null;
        date: string;
        label: string;
        shifts: readonly RosterShift[];
    }) => ShiftClipboardEntry | null;
    /** Empties the clipboard (after a destructive change, or on demand). */
    clear: () => void;
}

/**
 * In-memory clipboard for the weekly roster matrix.
 *
 * Copy/paste is deliberately **not** backed by the OS clipboard: the payload is
 * a structured set of shift attributes, not text, and reading the system
 * clipboard would require a permission prompt on every paste. Holding it in
 * React state keeps the interaction instant and lets the grid highlight the
 * source cell and arm every paste target while the clipboard is full.
 *
 * The stored values are already normalised through `toShiftTemplateValues`, so a
 * paste never carries the source shift's id, date or roster into the
 * destination.
 */
export function useShiftClipboard(): ShiftClipboard {
    const [entry, setEntry] = useState<ShiftClipboardEntry | null>(null);

    const copy = useCallback<ShiftClipboard['copy']>(({ employeeId, date, label, shifts }) => {
        if (shifts.length === 0) {
            return null;
        }

        const next: ShiftClipboardEntry = {
            sourceCellKey: cellKey(employeeId, date),
            sourceDate: date,
            sourceLabel: label,
            shifts: shifts.map(toShiftTemplateValues),
        };

        setEntry(next);

        return next;
    }, []);

    const clear = useCallback((): void => setEntry(null), []);

    const description = useMemo(() => {
        if (!entry) {
            return null;
        }

        const count = entry.shifts.length;

        return `${count} ${count === 1 ? 'shift' : 'shifts'} from ${entry.sourceLabel}`;
    }, [entry]);

    return {
        entry,
        isFilled: entry !== null,
        sourceCellKey: entry?.sourceCellKey ?? null,
        description,
        copy,
        clear,
    };
}
