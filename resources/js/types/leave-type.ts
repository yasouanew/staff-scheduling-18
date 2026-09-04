/** Lifecycle values supported by the leave type API. */
export const LEAVE_TYPE_STATUSES = ['active', 'inactive'] as const;

/* -------------------------------------------------------------------------- */
/* Colour palette                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Curated leave type colour swatches (hex values match the backend's
 * `regex:/^#([A-Fa-f0-9]{6})$/` rule). These are data values sent to the API —
 * not Tailwind styling — so hard-coded hex here is intentional and permitted.
 */
export const LEAVE_TYPE_COLOR_OPTIONS = [
    '#F59E0B', // amber (backend default)
    '#EF4444', // red
    '#DB2777', // pink
    '#7C3AED', // violet
    '#3B82F6', // blue
    '#06B6D4', // cyan
    '#10B981', // emerald
    '#84CC16', // lime
    '#F97316', // orange
    '#64748B', // slate
] as const;

/** Default colour applied to a brand-new leave type (matches backend default `#F59E0B`). */
export const DEFAULT_LEAVE_TYPE_COLOR = LEAVE_TYPE_COLOR_OPTIONS[0];

/** Lifecycle status for an employee-facing leave category. */
export type LeaveTypeStatus = (typeof LEAVE_TYPE_STATUSES)[number];

/** Clear human-readable labels for leave type states. */
export const LEAVE_TYPE_STATUS_LABELS: Record<LeaveTypeStatus, string> = {
    active: 'Active',
    inactive: 'Inactive',
};

/** A leave category employees can select when submitting a leave request. */
export interface LeaveType {
    id: string;
    companyId: number | null;
    name: string;
    code: string | null;
    description: string | null;
    allowanceDays: number | null;
    isPaid: boolean;
    allowsRollover: boolean;
    maxRolloverDays: number | null;
    requiresApproval: boolean;
    allowsHalfDay: boolean;
    maxDaysPerRequest: number | null;
    color: string | null;
    status: LeaveTypeStatus;
    createdAt: string | null;
    updatedAt: string | null;
}

/** Server-side filters supported by the leave types index endpoint. */
export interface LeaveTypeListParams {
    search?: string;
    status?: LeaveTypeStatus;
    perPage?: number;
}

/** Input used to create or update a leave type. */
export interface LeaveTypeMutationInput {
    name: string;
    code: string | null;
    description: string | null;
    allowanceDays: number | null;
    isPaid: boolean;
    allowsRollover: boolean;
    maxRolloverDays: number | null;
    requiresApproval: boolean;
    allowsHalfDay: boolean;
    maxDaysPerRequest: number | null;
    color: string | null;
    status: LeaveTypeStatus;
}

/** Compact summary values used by the Leave Types workspace header. */
export interface LeaveTypeStats {
    total: number;
    active: number;
    paid: number;
    rolloverEnabled: number;
}
