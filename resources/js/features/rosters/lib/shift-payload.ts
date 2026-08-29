import type { RosterShift } from '@/types/roster-management';
import type { ShiftMutationInput, ShiftStatus } from '@/types/shift';

/**
 * Translation layer between the roster grid's view model (`RosterShift`) and the
 * shift API's write contract (`ShiftMutationInput`).
 *
 * The grid reads a *derived* shape — it invents an `open` status for unassigned
 * shifts and a `confirmed` status for acknowledged ones — while the database
 * only stores `scheduled | completed | cancelled | swap_requested`. Keeping the
 * mapping here means the cell actions (add, paste, quick edit) can never write
 * a status the backend would reject.
 */

/**
 * Collapses a grid status back onto a persistable one.
 *
 * `open` and `confirmed` are presentation-only, so both resolve to `scheduled`.
 */
export function toPersistedShiftStatus(status: RosterShift['status']): ShiftStatus {
    switch (status) {
        case 'completed':
        case 'cancelled':
            return status;
        default:
            return 'scheduled';
    }
}

/**
 * The schedulable attributes of a shift, stripped of its identity and of where
 * it sits on the calendar.
 *
 * This is exactly what "copy a shift" means: the times, the break, the role and
 * the headcount travel to the destination cell, while the id, the date and the
 * owning roster are re-derived from wherever the paste lands.
 */
export interface ShiftTemplateValues {
    /** Local start time, `HH:mm`. */
    startTime: string;
    /** Local end time, `HH:mm`. */
    endTime: string;
    /** Break length in minutes. */
    breakMinutes: number;
    /** When true the break is paid and is not deducted from payable hours. */
    isPaidBreak: boolean;
    /** Position/role id, when assigned. */
    positionId: string | null;
    /** Headcount required for the shift. */
    requiredStaff: number;
    /** Free-text handover notes. */
    notes: string | null;
    /** Persisted lifecycle status. */
    status: ShiftStatus;
}

/** Sensible defaults for a brand-new shift created from an empty cell. */
export const DEFAULT_SHIFT_TEMPLATE: ShiftTemplateValues = {
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    isPaidBreak: false,
    positionId: null,
    requiredStaff: 1,
    notes: null,
    status: 'scheduled',
};

/** Extracts the reusable (copyable) attributes of an existing shift. */
export function toShiftTemplateValues(shift: RosterShift): ShiftTemplateValues {
    return {
        startTime: shift.startTime ?? DEFAULT_SHIFT_TEMPLATE.startTime,
        endTime: shift.endTime ?? DEFAULT_SHIFT_TEMPLATE.endTime,
        breakMinutes: shift.breakMinutes,
        isPaidBreak: shift.isPaidBreak,
        positionId: shift.positionId === null ? null : String(shift.positionId),
        requiredStaff: shift.requiredStaff,
        notes: shift.notes,
        status: toPersistedShiftStatus(shift.status),
    };
}

/** Where a set of template values is being written to. */
export interface ShiftPlacement {
    /** Roster that owns the destination cell. */
    rosterId: string;
    /** ISO date (`yyyy-MM-dd`) of the destination column. */
    date: string;
    /** Employee of the destination row, or `null` to leave the shift open. */
    employeeId: string | null;
}

/** Builds the API payload that writes `values` into `placement`. */
export function toShiftMutationInput(
    placement: ShiftPlacement,
    values: ShiftTemplateValues,
): ShiftMutationInput {
    return {
        rosterId: placement.rosterId,
        date: placement.date,
        employeeId: placement.employeeId,
        startTime: values.startTime,
        endTime: values.endTime,
        breakMinutes: values.breakMinutes,
        isPaidBreak: values.isPaidBreak,
        positionId: values.positionId,
        requiredStaff: values.requiredStaff,
        notes: values.notes,
        status: values.status,
    };
}
