import type { Employee } from './employee';
import type { RosterStatus } from './roster-management';


/** Lifecycle statuses supported by the shift API. */
export const SHIFT_STATUSES = [
    'scheduled',
    'completed',
    'cancelled',
    'swap_requested',
] as const;

/** A lifecycle value displayed and managed by the shifts workspace. */
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

/** Human-readable labels used by badges, filters, and accessible controls. */
export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
    scheduled: 'Scheduled',
    completed: 'Completed',
    cancelled: 'Cancelled',
    swap_requested: 'Swap requested',
};

/** Compact relationship displayed in the shifts table. */
export interface ShiftNamedReference {
    id: string;
    name: string;
}

/** A single scheduled staffing requirement within a roster. */
export interface Shift {
    id: string;
    companyId: number | null;
    branchId: string | null;
    rosterId: string;
    employeeId: string | null;
    positionId: string | null;
    departmentId: string | null;
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    isPaidBreak: boolean;
    requiredStaff: number;
    status: ShiftStatus;
    notes: string | null;
    /**
     * Publication state of the owning roster week.
     *
     * Publication is a property of the *roster*, not the shift, but the calendar
     * renders shifts — so it has to be carried here for a cell to be able to say
     * whether what it shows is still a draft or is already visible to staff.
     * Defaults to `draft` when the relation is absent, which is the safe reading:
     * never imply staff have seen something they may not have.
     */
    rosterStatus: RosterStatus;
    branch: ShiftNamedReference | null;
    roster: ShiftNamedReference | null;

    employee: Employee | null;
    position: ShiftNamedReference | null;
    department: ShiftNamedReference | null;
    createdAt: string | null;
    updatedAt: string | null;
}

/** Server-side query parameters supported by `GET /v1/shifts`. */
export interface ShiftListParams {
    rosterId?: string;
    branchId?: string;
    employeeId?: string;
    status?: ShiftStatus;
    dateFrom?: string;
    dateTo?: string;
    perPage?: number;
}

/** A selected roster, used by the form to keep staff times in branch context. */
export interface ShiftRosterOption {
    id: string;
    label: string;
    branchId: string | null;
    branchName: string | null;
    timezone: string | null;
}

/** Available active role used by the shift position selector. */
export interface ShiftPositionOption {
    id: string;
    name: string;
    departmentName: string | null;
}

/** Input transmitted when creating or updating a shift. */
export interface ShiftMutationInput {
    rosterId: string;
    date: string;
    startTime: string;
    endTime: string;
    positionId: string | null;
    employeeId: string | null;
    requiredStaff: number;
    notes: string | null;
    status: ShiftStatus;
    /**
     * Break length in minutes. Optional: callers that do not manage breaks (a
     * drag-to-reschedule, for example) omit it so the stored value survives.
     */
    breakMinutes?: number;
    /** When true the break is paid and is not deducted from payable hours. */
    isPaidBreak?: boolean;
}


/** A potential overlap detected before an employee is assigned or a shift is saved. */
export interface ShiftConflict {
    shift: Shift;
    message: string;
}

/** Summary values displayed in the shift workspace. */
export interface ShiftStats {
    total: number;
    open: number;
    assigned: number;
    totalHours: number;
}
