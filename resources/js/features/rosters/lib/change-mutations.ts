import type { RosterChangeMutation, RosterShift } from '@/types/roster-management';

import type { ShiftTemplateValues } from './shift-payload';

/**
 * Pure helpers for the post-publication "Save Changes & Notify" flow.
 *
 * When a roster is published, edits are no longer written to the database one
 * shift at a time. Instead each cell gesture is staged as a {@link RosterChangeMutation}
 * (add / update / cancel / reassign) and the whole batch is previewed and then
 * applied atomically by the backend. These helpers build the mutation payloads
 * and derive the optimistic "working shifts" the grid renders while the batch is
 * still pending.
 */

/** Prefix used for locally-generated ids of shifts that have not been saved yet. */
export const TEMP_SHIFT_PREFIX = 'temp-';

/** True when the id refers to a shift staged as an `add` that is not yet saved. */
export function isTempShiftId(id: string): boolean {
    return id.startsWith(TEMP_SHIFT_PREFIX);
}

let tempCounter = 0;

/** Generates a unique, stable temporary shift id for a staged `add`. */
export function nextTempShiftId(): string {
    tempCounter += 1;
    return `${TEMP_SHIFT_PREFIX}${Date.now()}-${tempCounter}`;
}

/** Where a mutation payload is being written to. */
export interface ChangePlacement {
    /** ISO date (`yyyy-MM-dd`) of the destination column. */
    date: string;
    /** Employee of the row, or `null` for the open-shifts row. */
    employeeId: string | null;
}

/**
 * Builds the `shift` payload for an `add`/`update` mutation.
 *
 * Mirrors `ShiftMutationInput` but omits the roster id (the backend derives it
 * from the roster being edited) and keeps `employee_id` optional so a plain
 * edit does not accidentally clear an assignment.
 */
export function toShiftChangePayload(
    placement: ChangePlacement,
    values: ShiftTemplateValues,
    includeEmployee = true,
): Record<string, unknown> {
    return {
        date: placement.date,
        start_time: values.startTime,
        end_time: values.endTime,
        break_minutes: values.breakMinutes,
        paid_break: values.isPaidBreak,
        position_id: values.positionId ? Number(values.positionId) : null,
        ...(includeEmployee
            ? { employee_id: placement.employeeId ? Number(placement.employeeId) : null }
            : {}),
        required_staff: values.requiredStaff,
        notes: values.notes,
        status: values.status,
    };
}

/**
 * Derives the grid's "working shifts" from the server shifts plus the staged
 * mutations.
 *
 * The grid keeps rendering from the base `shifts` array, but for a published
 * roster the manager's staged add/update/cancel/reassign edits are applied on
 * top so the week always shows what would be saved. Adds get temporary ids
 * (see {@link isTempShiftId}); a temp shift that is subsequently cancelled is
 * dropped entirely rather than rendered as a cancelled block.
 */
export function deriveWorkingShifts(
    shifts: readonly RosterShift[],
    mutations: readonly RosterChangeMutation[],
): RosterShift[] {
    const working = shifts.map((shift) => ({ ...shift }));

    for (const mutation of mutations) {
        switch (mutation.type) {
            case 'add': {
                const values = mutation.shift ?? {};
                const tempId = mutation.id ?? nextTempShiftId();
                const employeeId = values.employee_id == null ? null : String(values.employee_id);

                working.push({
                    id: tempId,
                    rosterId: null,
                    branchId: values.branch_id == null ? null : Number(values.branch_id),
                    employeeId,
                    employeeName: null,
                    employeeAvatarUrl: null,
                    positionId: values.position_id == null ? null : Number(values.position_id),
                    positionName: null,
                    positionColor: null,
                    departmentId:
                        values.department_id == null ? null : Number(values.department_id),
                    departmentName: null,
                    branchName: null,
                    date: (values.date as string) ?? null,
                    startTime: (values.start_time as string) ?? null,
                    endTime: (values.end_time as string) ?? null,
                    breakMinutes: Number(values.break_minutes ?? 0),
                    isPaidBreak: Boolean(values.paid_break),
                    requiredStaff: Math.max(1, Number(values.required_staff ?? 1) || 1),
                    status: employeeId === null ? 'open' : 'scheduled',
                    notes: (values.notes as string) ?? null,
                    flags: { overtimeRisk: false, leaveConflict: false, doubleBooked: false },
                });
                break;
            }

            case 'update': {
                const shift = working.find((entry) => entry.id === mutation.id);
                if (!shift) {
                    break;
                }
                applyShiftValues(shift, mutation.shift ?? {});
                break;
            }

            case 'cancel': {
                const index = working.findIndex((entry) => entry.id === mutation.id);
                if (index === -1) {
                    break;
                }
                // Cancelling removes the shift from the roster: a just-added
                // temp shift nets out to "never add it", and a persisted shift
                // is dropped from the working set (the backend hard-deletes it
                // on apply, keeping only the audit + notification trail).
                working.splice(index, 1);
                break;
            }

            case 'reassign': {
                const shift = working.find((entry) => entry.id === mutation.id);
                if (!shift) {
                    break;
                }
                shift.employeeId =
                    mutation.employee_id == null ? null : String(mutation.employee_id);
                shift.employeeName = null;
                if (shift.employeeId === null) {
                    shift.status = 'open';
                }
                applyShiftValues(shift, mutation.shift ?? {});
                break;
            }
        }
    }

    return working;
}

/** Applies raw snake_case shift values onto a working shift object. */
function applyShiftValues(shift: RosterShift, values: Record<string, unknown>): void {
    if (values.date !== undefined) {
        shift.date = (values.date as string) ?? null;
    }
    if (values.start_time !== undefined) {
        shift.startTime = (values.start_time as string) ?? null;
    }
    if (values.end_time !== undefined) {
        shift.endTime = (values.end_time as string) ?? null;
    }
    if (values.break_minutes !== undefined) {
        shift.breakMinutes = Math.max(0, Number(values.break_minutes ?? 0));
    }
    if (values.paid_break !== undefined) {
        shift.isPaidBreak = Boolean(values.paid_break);
    }
    if (values.position_id !== undefined) {
        shift.positionId = values.position_id == null ? null : Number(values.position_id);
    }
    if (values.required_staff !== undefined) {
        shift.requiredStaff = Math.max(1, Number(values.required_staff ?? 1) || 1);
    }
    if (values.notes !== undefined) {
        shift.notes = (values.notes as string) ?? null;
    }
    if (values.status !== undefined) {
        const status = values.status as string;
        if (status === 'cancelled') {
            shift.status = 'cancelled';
        } else if (shift.employeeId !== null) {
            shift.status = 'scheduled';
        }
    }
}
